/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */
/* jshint esnext: true */
/* jshint -W097 */
/* global imports: false */
/* global global: false */
/**
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
**/

const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Gettext = imports.gettext.domain('gnome-shell-extensions-mediaplayer');
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Lib = Me.imports.lib;
const Manager = Me.imports.manager;
const Panel = Me.imports.panel;
const Settings = Me.imports.settings;

/* global values */
let manager;
let indicator;
let _fileMonitor;
let _defaultAppsGioFile = Gio.File.new_for_path(GLib.get_home_dir() + '/.config/mimeapps.list');

function init() {
  Lib.initTranslations(Me);
  Settings.init();
  Settings.gsettings.connect("changed::" + Settings.MEDIAPLAYER_INDICATOR_POSITION_KEY, function() {_reset()});
  Settings.gsettings.connect("changed::" + Settings.MEDIAPLAYER_MENU_POSITION_KEY, function() {_reset()});
  if (_defaultAppsGioFile.query_exists(null)) {
    _fileMonitor = _defaultAppsGioFile.monitor(Gio.FileMonitorFlags.NONE, null);
    _fileMonitor.connect('changed', function() {Mainloop.timeout_add(500, _reset)});
  } 
}

function _reset() {
  if (manager) {
    disable();
    enable();
  }
}

function enable() {
  let position = Settings.gsettings.get_enum(Settings.MEDIAPLAYER_INDICATOR_POSITION_KEY),
      menu, desiredMenuPosition;

  if (position == Settings.IndicatorPosition.VOLUMEMENU) {
    indicator = new Panel.AggregateMenuIndicator();
    menu = Main.panel.statusArea.aggregateMenu.menu;
    Settings.gsettings.set_int(Settings.MEDIAPLAYER_NUM_MENU_ITEMS_KEY, menu.numMenuItems + 1);
    desiredMenuPosition = Settings.gsettings.get_int(Settings.MEDIAPLAYER_MENU_POSITION_KEY) - 1; 
  }
  else {
    indicator = new Panel.PanelIndicator();
    menu = indicator.menu;
    desiredMenuPosition = 0;
  }

  manager = new Manager.PlayerManager(menu, desiredMenuPosition);

  if (position == Settings.IndicatorPosition.RIGHT) {
    Main.panel.addToStatusArea('mediaplayer', indicator);
  }
  else if (position == Settings.IndicatorPosition.CENTER) {
    Main.panel.addToStatusArea('mediaplayer', indicator, 999, 'center');
  }
  else {
    Main.panel.statusArea.aggregateMenu._indicators.insert_child_at_index(indicator.indicators, 0);
  }

  indicator.manager = manager;
}

function disable() {
  manager.destroy();
  manager = null;
  if (indicator instanceof Panel.PanelIndicator) {
    indicator.destroy();
    indicator = null;
  }
  else {
    indicator.indicators.destroy();
    indicator = null;
  }
  if (Settings.MINOR_VERSION > 19) {
    let stockMpris = Main.panel.statusArea.dateMenu._messageList._mediaSection;
    if (stockMpris._shouldShow()) {
      stockMpris.actor.show();
    }
  }
}
