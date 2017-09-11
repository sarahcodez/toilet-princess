// See (Electron): https://github.com/electron/electron-quick-start
// See (Door sensor application): https://github.com/brentertz/ocupado-app 
const path = require('path');
const url = require('url');
const fs = require('fs');
const _ = require('lodash');

const defaultConfig = require('./config/defaults');
const localConfigPath = path.join(__dirname, '/config', 'local.js');
const localConfig = fs.existsSync(localConfigPath) ? require(localConfigPath) : {};

const {PHOTON_1, PHOTON_2, PARTICLE_ACCESS_TOKEN} = _.merge({}, defaultConfig, localConfig);
const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron');

let appWindow, tray;
let browserState = 'Checking connection to Internet...';
let devices = {
  [PHOTON_1]: {name: 'Toilet 1', online: false, open: false, eventSource: null},
  [PHOTON_2]: {name: 'Toilet 2', online: false, open: false, eventSource: null}
};

function createWindow() {
  appWindow = new BrowserWindow({ width: 0, height: 0, show: false });
  appWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  appWindow.on('closed', function () {
    appWindow = null;
  });

  let openToilets = Object.values(devices).filter((device) => (device.online && device.open));

  tray = new Tray(path.join(__dirname, '/images', '/poo-' + openToilets.length + '-icon.png')); // **
  createMenu();
}

function createMenu() {
  const template = [
    { label: browserState, enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: app.quit }
  ];
  const contextMenu = Menu.buildFromTemplate(template);

  tray.setToolTip('Toilet Princess');
  tray.setHighlightMode('never');
  tray.setContextMenu(contextMenu);
}

app.on('ready', createWindow);

app.on('window-all-closed', function() {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (appWindow === null) {
    createWindow()
  }
});

ipcMain.on('browser-status-changed', (event, status) => {
  if (status === 'online') {
    browserState = 'Online';
  } else {
    browserState = 'Offline';
  }
});
