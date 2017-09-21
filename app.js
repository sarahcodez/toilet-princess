// See (Electron): https://github.com/electron/electron-quick-start
// See (Door sensor application): https://github.com/brentertz/ocupado-app
const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');
const _ = require('lodash');
const EventSource = require('eventsource');
const request = require('request');

const defaultConfig = require('./config/defaults');
const localConfigPath = path.join(__dirname, '/config', 'local.js');
const localConfig = fs.existsSync(localConfigPath) ? require(localConfigPath) : {};
const { 
  PHOTON_1, PHOTON_2, PHOTON_3, PHOTON_4, PARTICLE_ACCESS_TOKEN, PARTICLE_BASE_URL
} = _.merge({}, defaultConfig, localConfig);

let appWindow, appTray;
let browserState = 'Checking connection to Internet...';
let devices = {
  [PHOTON_1]: {name: 'Toilet 1   ', online: false, open: false, eventSource: null},
  [PHOTON_2]: {name: 'Toilet 2   ', online: false, open: false, eventSource: null},
  [PHOTON_3]: {name: 'Toilet 3   ', online: false, open: false, eventSource: null},
  [PHOTON_4]: {name: 'Toilet 4   ', online: false, open: false, eventSource: null},
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

  let openToilets = getOpenToilets();

  appTray = new Tray(path.join(__dirname, '/images', '/toilet-0-icon.png'));
  createMenu();
}

function getOpenToilets() {
  return Object.values(devices).filter((device) => (device.online && device.open));
}

function createMenu() {
  const browserStateItem = { label: browserState, enabled: false };
  const quitItem = { label: 'Quit', click: app.quit };
  const separatorItem = { type: 'separator' };
  let template = [];

  template.push(browserStateItem, separatorItem);

  for (deviceId in devices) {
    const device = devices[deviceId];

    let deviceItem = {
      label: device.name,
      type: 'normal',
      icon: getDeviceIcon(deviceId)
    };

    template.push(deviceItem);
  }

  template.push(separatorItem, quitItem);

  const contextMenu = Menu.buildFromTemplate(template);

  appTray.setToolTip('Toilet Princess');
  appTray.setHighlightMode('never');
  appTray.setContextMenu(contextMenu);
}

function getDeviceIcon(deviceId) {
  let icon = 'disconnected';

  if (devices.hasOwnProperty(deviceId)) {
    const device = devices[deviceId];

    if (device.online) {
      icon = device.open ? 'open' : 'closed';
    }
  }

  return path.join(__dirname, '/images', icon + '-icon.png');
}

function connect(deviceId) {
  const deviceIds = !deviceId ? Object.keys(devices) :
    (devices.hasOwnProperty(deviceId) ? [deviceId] : []);

  for (let deviceId of deviceIds) {
    const eventsUrl = PARTICLE_BASE_URL + '/v1/devices/' + deviceId +
      '/events?access_token=' + PARTICLE_ACCESS_TOKEN;
    const eventSource = new EventSource(eventsUrl);

    eventSource.onopen = function() {
      getCurrentState(deviceId);
    };

    eventSource.onerror = function() {
      console.error('Error communicating with Photon for ' + devices[deviceId].name);
      devices[deviceId].online = false;
      devices[deviceId].open = false;
      updateTray();

      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('Attempting to reconnect with Photon for ' +
          devices[deviceId].name + ' in 3 seconds');
        setTimeout(() => { reconnect(deviceId) }, 3000);
      }
    };

    eventSource.addEventListener(
      'doorMessage',
      function(event) {
        const data = JSON.parse(event.data);

        devices[deviceId].open = data.data === 'open';
        updateTray();
      }.bind(this),
      false
    );

    eventSource.addEventListener(
      // Triggered when photon is connected to a power source or (eventually) after it is disconnected
      'spark/status',
      function(event) {
        const data = JSON.parse(event.data);
        const deviceStatus = data.data;

        devices[deviceId].online = deviceStatus === 'online';

        if (deviceStatus === 'online') {
          getCurrentState(deviceId);
        } else {
          updateTray();
        }
      }.bind(this),
      false
    );

    if (devices[deviceId].eventSource) {
      devices[deviceId].eventSource.close();
      devices[deviceId].eventSource = null;
    }
    devices[deviceId].eventSource = eventSource;
  }
}

function getCurrentState(deviceId) {
  if (!devices.hasOwnProperty(deviceId)) {
    return;
  }

  const doorStateUrl = PARTICLE_BASE_URL + '/v1/devices/' + deviceId +
    '/doorMessage?access_token=' + PARTICLE_ACCESS_TOKEN;

  request(
    doorStateUrl,
    function(error, response, body) {
      if (!error && response.statusCode === 200) {
        const data = JSON.parse(body);

        devices[deviceId].open = data.result === 'open';
        devices[deviceId].online = true;
        updateTray();
      } else if (error) {
        console.error('Error checking door state for ' + devices[deviceId].name, body);
      }
    }.bind(this)
  );
}

function updateTray() {
  let openToilets = getOpenToilets();

  appTray.setImage(path.join(__dirname, '/images', '/toilet-' + openToilets.length + '-icon.png'));
  createMenu();
}

function reconnect(deviceId) {
  if (devices.hasOwnProperty(deviceId) &&
      devices[deviceId].eventSource.readyState === EventSource.CLOSED) {
    connect(deviceId);
  }
}

function disconnect() {
  for (let deviceId in devices) {

    if (devices[deviceId].eventSource) {
      devices[deviceId].eventSource.close();
      devices[deviceId].eventSource = null;
    }
    devices[deviceId].online = false;
    devices[deviceId].open = false;
  }
  updateTray();
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
    connect();
  } else {
    browserState = 'Offline';
    disconnect();
  }
});
