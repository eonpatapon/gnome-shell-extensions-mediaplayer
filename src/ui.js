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

'use strict';

const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const GLib = imports.gi.GLib;
const Tweener = imports.ui.tweener;
const BoxPointer = imports.ui.boxpointer;

const Gettext = imports.gettext.domain('gnome-shell-extensions-mediaplayer');
const _ = Gettext.gettext;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Widget = Me.imports.widget;
const Settings = Me.imports.settings;
const Player = Me.imports.player;
const Lib = Me.imports.lib;

const COVER_SIZE = 100;


const PlayerMenu = new Lang.Class({
  Name: 'PlayerMenu',
  Extends: PopupMenu.PopupSubMenuMenuItem,

  _init: function(label, wantIcon) {
    this.parent(label, wantIcon);
    this.menu._close = this.menu.close;
    this.menu._open = this.menu.open;
    this.menu.close = Lang.bind(this, this.close);
    this.menu.open = Lang.bind(this, this.open);
  },

  addMenuItem: function(item) {
    this.menu.addMenuItem(item);
  },

  /* Submenu can be closed only manually by
   * setSubmenuShown (clicking on the player name
   *  or by the manager when another player menu
   * is opened */
  close: function(animate, force) {
    global.log("close: " + force);
    if (force !== true)
      return;
    this.menu._close(BoxPointer.PopupAnimation.FULL);
    this.emit('player-menu-closed');
  },

  open: function(animate) {
    if (!animate)
      animate = BoxPointer.PopupAnimation.FULL;
    this.menu._open(animate);
    this.emit('player-menu-opened');
  },

  setSubmenuShown: function(open) {
    if (open)
      this.menu.open(BoxPointer.PopupAnimation.FULL);
    else
      this.menu.close(BoxPointer.PopupAnimation.FULL, true);
  }

});


const DefaultPlayerUI = new Lang.Class({
    Name: 'DefaultPlayerUI',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function() {
      this.parent();

      this.app = Shell.AppSystem.get_default().lookup_app(
        Gio.app_info_get_default_for_type('audio/x-vorbis+ogg', false).get_id()
      );
      let appInfo = Gio.DesktopAppInfo.new(this.app.get_id());

      this.label = new St.Label({text: this.app.get_name()});
      this.icon = new St.Icon({gicon: appInfo.get_icon(), style_class: 'popup-menu-icon'});

      this.actor.add_child(this.icon);
      this.actor.add_child(this.label);

      this.connect('activate', Lang.bind(this, this.run));
    },

    run: function() {
      this.app.activate_full(-1, 0);
    }
});


const PlayerUI = new Lang.Class({
  Name: 'PlayerUI',
  Extends: PlayerMenu,

  _init: function(player) {
    this.parent(player.info.identity, true);
    this.player = player;
    this._updateId = player.connect("player-update", Lang.bind(this, this.update));
    this._updateInfoId = player.connect("player-update-info", Lang.bind(this, this.updateInfo));

    this.showRating = false;
    this.showVolume = false;
    this.showPosition = false;
    this.showPlaylists = false;

    this.trackCoverUrl = false;
    this.trackCoverFileTmp = false;
    this.trackCover = new St.Button({style_class: 'track-cover-container',
                                     x_align: St.Align.START,
                                     y_align: St.Align.START,
                                     child: new St.Icon({icon_name: "media-optical-cd-audio",
                                                         icon_size: COVER_SIZE})});
    this.trackCover.connect('clicked', Lang.bind(this, this._toggleCover));

    this.trackBox = new Widget.TrackBox(this.trackCover);
    this.trackBox.connect('activate', Lang.bind(this.player, this.player.raise));
    this.addMenuItem(this.trackBox);

    this.prevButton = new Widget.PlayerButton('media-skip-backward-symbolic',
                                              Lang.bind(this.player, this.player.previous));
    this.playButton = new Widget.PlayerButton('media-playback-start-symbolic',
                                              Lang.bind(this.player, this.player.playPause));
    this.stopButton = new Widget.PlayerButton('media-playback-stop-symbolic',
                                              Lang.bind(this.player, this.player.stop));
    this.stopButton.hide();
    this.nextButton = new Widget.PlayerButton('media-skip-forward-symbolic',
                                              Lang.bind(this.player, this.player.next));

    this.trackControls = new Widget.PlayerButtons();
    this.trackControls.addButton(this.prevButton);
    this.trackControls.addButton(this.playButton);
    this.trackControls.addButton(this.stopButton);
    this.trackControls.addButton(this.nextButton);

    this.addMenuItem(this.trackControls);

    this.volume = new Widget.SliderItem(_("Volume"), "audio-volume-high-symbolic", 0);
    this.volume.connect('value-changed', Lang.bind(this, function(item) {
      this.player.setVolume(item._value);
    }));
    this.addMenuItem(this.volume);

    this.position = new Widget.SliderItem("0:00 / 0:00", "document-open-recent", 0);
    this.position.connect('value-changed', Lang.bind(this, function(item) {
      this.player.seek(item._value);
    }));
    this.addMenuItem(this.position);

    this.playlists = new PopupMenu.PopupSubMenuMenuItem(_("Playlists"));
    this.addMenuItem(this.playlists);
  },

  update: function(player, newState) {

    global.log("#######################");
    global.log(JSON.stringify(newState));

    if (newState.showRating !== null) {
      this.showRating = newState.showRating;
    }

    if (newState.showVolume !== null) {
      this.showVolume = newState.showVolume;
      if (this.showVolume)
        this.volume.actor.show();
      else
        this.volume.actor.hide();
    }

    if (newState.showPosition !== null) {
      this.showPosition = newState.showPosition;
      if (this.showPosition)
        this.position.actor.show();
      else {
        this.position.actor.hide();
      }
    }

    if (newState.showPlaylist !== null) {
      this.showPlaylist = newState.showPlaylist;
      if (this.showPlaylist)
        this.playlists.actor.show();
      else {
        this.playlists.actor.hide();
      }
    }

    if (newState.trackTitle || newState.trackArtist || newState.trackAlbum) {
      this.trackBox.empty();
      Settings.TRACKBOX_CONTENTS.forEach(Lang.bind(this, function(trackInfo) {
        let text = Lib.compileTemplate(trackInfo.template, newState);
        this.trackBox.addInfo(new Widget.TrackInfo(text, trackInfo.style_class));
      }));
      if (player.state.trackRating !== null && this.showRating)
        this.trackBox.addInfo(new Widget.TrackRating(null, player.state.trackRating, 'track-rating', this.player));
    }

    if (newState.volume !== null) {
      let value = newState.volume;
      if (value === 0)
          this.volume.setIcon("audio-volume-muted-symbolic");
      if (value > 0)
          this.volume.setIcon("audio-volume-low-symbolic");
      if (value > 0.30)
          this.volume.setIcon("audio-volume-medium-symbolic");
      if (value > 0.80)
          this.volume.setIcon("audio-volume-high-symbolic");
      this.volume.setValue(value);
    }

    if (newState.trackCoverUrl !== null && newState.trackCoverUrl !== this.trackCoverUrl) {
      if (newState.trackCoverUrl) {
        let cover_path = "";
        // Distant cover
        if (newState.trackCoverUrl.match(/^http/)) {
          // hide current cover
          this._hideCover();
          // Copy the cover to a tmp local file
          let cover = Gio.file_new_for_uri(decodeURIComponent(newState.trackCoverUrl));
          // Don't create multiple tmp files
          if (!this.trackCoverFileTmp)
            this.trackCoverFileTmp = Gio.file_new_tmp('XXXXXX.mediaplayer-cover')[0];
          // asynchronous copy
          cover.read_async(null, null, Lang.bind(this, this._onReadCover));
        }
        // Local cover
        else if (newState.trackCoverUrl.match(/^file/)) {
          this.trackCoverPath = decodeURIComponent(newState.trackCoverUrl.substr(7));
          this._showCover();
        }
      }
      else {
        this.trackCoverPath = false;
        this._showCover();
      }
      this.trackCoverUrl = newState.trackCoverUrl;
    }

    if (newState.canPause !== null) {
      if (newState.canPause)
        this.playButton.setCallback(Lang.bind(this.player, this.player.playPause));
      else
        this.playButton.setCallback(Lang.bind(this.player, this.player.play));
    }

    if (newState.canGoNext !== null) {
      if (newState.canGoNext)
        this.nextButton.enable();
      else
        this.nextButton.disable();
    }

    if (newState.canGoPrevious !== null) {
      if (newState.canGoPrevious)
        this.prevButton.enable();
      else
        this.prevButton.disable();
    }

    if (newState.canSeek !== null) {
      if (newState.canSeek && this.showPosition &&
          this.player.state.status != Settings.Status.STOP)
        this.position.actor.show();
      else {
        this.position.actor.hide();
      }
    }

    if (newState.trackTime && newState.trackLength) {
      this.position.setLabel(
        this._formatTime(newState.trackTime) + " / " + this._formatTime(newState.trackLength)
      );
      this.position.setValue(newState.trackTime / newState.trackLength);
    }

    if (newState.status) {
      let status = newState.status;
      this.status.text = _(status);

      if (status == Settings.Status.STOP) {
        this.trackBox.hideAnimate();
        this.volume.actor.hide();
        this.position.actor.hide();
      }
      else {
        this.trackBox.showAnimate();
        if (this.showVolume)
          this.volume.actor.show();
        if (this.showPosition)
          this.position.actor.show();
      }

      if (status === Settings.Status.PLAY) {
        this.stopButton.show();
        this.playButton.setIcon('media-playback-pause-symbolic');
      }
      else if (status === Settings.Status.PAUSE) {
        this.playButton.setIcon('media-playback-start-symbolic');
      }
      else if (status == Settings.Status.STOP) {
        this.stopButton.hide();
        this.playButton.show();
        this.playButton.setIcon('media-playback-start-symbolic');
      }
    }

    if (newState.playlists) {
      newState.playlists.forEach(Lang.bind(this, function(playlist) {
        global.log(playlist);
        let obj = playlist[0],
            name = playlist[1];
        if (obj.toString().search('Video') > 0)
          return;
        if (this.playlists.menu._getMenuItems().reduce(function(acc, menuItem) { if (menuItem.actor.obj == obj) return true; }, false)) {
          global.log("return playlist");
          return;
        }
        let playlistUI = new Widget.PlaylistItem(name, obj);
        playlistUI.connect('activate', Lang.bind(this, function(playlist) {
          this.player.playPlaylist(playlist.obj);
        }));
        global.log("add " + playlistUI);
        this.playlists.menu.addMenuItem(playlistUI);
      }));
    }

    if (newState.playlist) {
      this.playlists.menu._getMenuItems().forEach(function(playlistItem) {
        if (playlistItem.actor.obj == newState.playlist[0])
          playlistItem.setShowDot(true);
        else
          playlistItem.setShowDot(false);
      });
    }
  },

  _onReadCover: function(cover, result) {
    let inStream = cover.read_finish(result);
    let outStream = this.trackCoverFileTmp.replace(null, false,
                                                   Gio.FileCreateFlags.REPLACE_DESTINATION,
                                                   null, null);
    outStream.splice_async(inStream, Gio.OutputStreamSpliceFlags.CLOSE_TARGET,
                           0, null, Lang.bind(this, this._onSavedCover));
  },

  _onSavedCover: function(outStream, result) {
    outStream.splice_finish(result, null);
    this.trackCoverPath = this.trackCoverFileTmp.get_path();
    this._showCover();
  },

  _hideCover: function() {
    Tweener.addTween(this.trackCover, {
      opacity: 0,
      time: 0.3,
      transition: 'easeOutCubic',
    });
  },

  _showCover: function() {
    Tweener.addTween(this.trackCover, {
      opacity: 0,
      time: 0.3,
      transition: 'easeOutCubic',
      onComplete: Lang.bind(this, function() {
        // Change cover
        if (! this.trackCoverPath || ! GLib.file_test(this.trackCoverPath, GLib.FileTest.EXISTS)) {
          let coverIcon = new St.Icon({icon_name: "media-optical-cd-audio",
                                       icon_size: this.trackCover.child.icon_size});
          this.trackCover.child = coverIcon;
        }
        else {
          let gicon = new Gio.FileIcon({file: Gio.File.new_for_path(this.trackCoverPath)});
          let coverIcon = new St.Icon({gicon: gicon, style_class: "track-cover",
                                       icon_size: this.trackCover.child.icon_size});
          this.trackCover.child = coverIcon;
        }
        // Show the new cover
        Tweener.addTween(this.trackCover, {
          opacity: 255,
          time: 0.3,
          transition: 'easeInCubic',
        });
      })
    });
  },

  _toggleCover: function() {
    if (this.trackCover.child.has_style_class_name('track-cover')) {
      let size = this.trackCover.child.icon_size,
          targetSize;
      if (size == COVER_SIZE)
        targetSize = size * 2;
      else
        targetSize = COVER_SIZE;
      Tweener.addTween(this.trackCover.child, {icon_size: targetSize,
                                               time: 0.3,
                                               transition: 'easeInCubic'});
    }
  },

  _formatTime: function(s) {
    let ms = s * 1000;
    let msSecs = (1000);
    let msMins = (msSecs * 60);
    let msHours = (msMins * 60);
    let numHours = Math.floor(ms/msHours);
    let numMins = Math.floor((ms - (numHours * msHours)) / msMins);
    let numSecs = Math.floor((ms - (numHours * msHours) - (numMins * msMins))/ msSecs);
    if (numSecs < 10)
      numSecs = "0" + numSecs.toString();
    if (numMins < 10 && numHours > 0)
      numMins = "0" + numMins.toString();
    if (numHours > 0)
      numHours = numHours.toString() + ":";
    else
      numHours = "";
    return numHours + numMins.toString() + ":" + numSecs.toString();
  },

  updateInfo: function(player, playerInfo) {
    this.icon.gicon = playerInfo.appInfo.get_icon();
    this.label.text = playerInfo.identity;
  },

  toString: function() {
      return "[object PlayerUI(%s)]".format(this.player.info.identity);
  },


  destroy: function() {
    if (this._updateId) {
      this.player.disconnect(this._updateId);
      this.player.disconnect(this._updateInfoId);
    }
    this.parent();
  }

});
