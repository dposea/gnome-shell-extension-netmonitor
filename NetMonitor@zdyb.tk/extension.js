 /*
  * Copyright 2011 Aleksander Zdyb
  *
  * This program is free software: you can redistribute it and/or modify
  * it under the terms of the GNU General Public License as published by
  * the Free Software Foundation, either version 3 of the License, or
  * (at your option) any later version.
  * 
  * This program is distributed in the hope that it will be useful,
  * but WITHOUT ANY WARRANTY; without even the implied warranty of
  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  * GNU General Public License for more details.
  * 
  * You should have received a copy of the GNU General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>.
  */

const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Shell = imports.gi.Shell;
const Lang = imports.lang;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const DBus = imports.dbus;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const Gettext = imports.gettext;
const MessageTray = imports.ui.messageTray;
const Tweener = imports.tweener.tweener;
const Clutter = imports.gi.Clutter;

const _ = Gettext.gettext;

const UPDATE_INTERVAL = 2000;
const GSETTINGS_SCHEMA = 'org.gnome.shell.extensions.net-monitor';

const settings = new Gio.Settings({ schema: GSETTINGS_SCHEMA });


/* ********************   N E T W O R K   M A N A G E R   ******************** */
const NM_DEVICE_STATE_DISCONNECTED = 30;
const NM_DEVICE_STATE_ACTIVATED = 100;
const NM_DEVICE_STATE_DEACTIVATING = 110;
const NM_DEVICE_STATE_FAILED = 120;

const NM_DEVICE_TYPE_UNKNOWN = 0
const NM_DEVICE_TYPE_ETHERNET = 1
const NM_DEVICE_TYPE_WIFI = 2
const NM_DEVICE_TYPE_UNUSED1 = 3
const NM_DEVICE_TYPE_UNUSED2 = 4
const NM_DEVICE_TYPE_BT = 5
const NM_DEVICE_TYPE_OLPC_MESH = 6
const NM_DEVICE_TYPE_WIMAX = 7
const NM_DEVICE_TYPE_MODEM = 8



const NetworkManagerInterface = {
    name: "org.freedesktop.NetworkManager",
    properties: [
        { name: "ActiveConnections", signature: "ao", access: "read" },
    ],
    methods: [
        { name: "GetDevices", outSignature: "ao", inSignature: "" }, 
        { name: "GetDeviceByIpIface", inSignature: "s", outSignature: "o" }
    ],
    signals: [
        { name: "PropertiesChanged", inSignature: "a{sv}" },
        { name: "DeviceAdded", inSignature: "ao" },
        { name: "DeviceRemoved", inSignature: "ao" },
    ]
};


function NetworkManager() {
    this._init();
    this.connect("DeviceAdded", Lang.bind(this, this.__device_added_callback));
    this.connect("DeviceRemoved", Lang.bind(this, this.__device_removed_callback));
    this.InvokeGetDevices();
};

NetworkManager.prototype = {
    ready: false,
    __device_added_callbacks: [],
    __device_removed_callbacks: [],
    __devices_raw: [],
    devices: [],
     
    _init: function() {
        DBus.system.proxifyObject(this, "org.freedesktop.NetworkManager", "/org/freedesktop/NetworkManager");
    },
    
    OnDeviceAdded: function(callback) {
        if (this.__device_added_callbacks.indexOf(callback) < 0) this.__device_added_callbacks.push(callback);  
    },
    
    OnDeviceRemoved: function(callback) {
        if (this.__device_removed_callbacks.indexOf(callback) < 0) this.__device_removed_callbacks.push(callback);  
    },
    
    InvokeGetDevices: function() {
        this.GetDevicesRemote(Lang.bind(this, this.__get_devices_callback));
    },
    
    __get_devices_callback: function (result, excp) {
        this.ready = true;
        for each (let dev in result) {
            if (this.__devices_raw.indexOf(dev) >= 0) continue;
            this.__device_added_callback(this, dev, null);
        }
    },
    
    __device_added_callback: function (sender, dev_path, excp) {
        this.__devices_raw.push(dev_path);
        let dev = new NetworkManagerDevice(dev_path);
        this.devices.push(dev);
        for each (let cb in this.__device_added_callbacks)
            cb(this, dev);
    },
    
    __device_removed_callback: function (sender, dev_path, excp) {
        print("R: " + dev_path);
        let di = this.__devices_raw.indexOf(dev_path);
        if (di >= 0) this.__devices_raw.splice(di, 1);
        
        let dev = null;
        for (let i in this.devices) {
            if (this.devices[i].toString() == dev_path) {
                dev = this.devices[i];
                this.devices.splice(i, 1);
                break;
            }
        }
        
        if (dev) {
            for each (let cb in this.__device_removed_callbacks)
                cb(this, dev);
        }
    }
    
    
};
DBus.proxifyPrototype(NetworkManager.prototype, NetworkManagerInterface);



const NetworkManagerDeviceInterface = {
    name: "org.freedesktop.NetworkManager.Device",
    properties: [
        { name: "State", signature: "u", access: "read" },
    ],
    signals: [
        { name: "StateChanged", inSignature: "uuu" }
    ]
};


function NetworkManagerDevice(device_path) {
    this._init(device_path);
    this.InvokeGetAll();
};

NetworkManagerDevice.prototype = {
    properties: {},
    
    _init: function(device_path) {
        DBus.system.proxifyObject(this, "org.freedesktop.NetworkManager", device_path);
    },
    
    GetState: function (callback) {
        this.GetRemote("State", Lang.bind(this, function(result, excp) {
            this.__state = result;
            if (callback) callback(this, result);
        }));
    },
    
    GetInterface: function (callback) {
        this.GetRemote("Interface", Lang.bind(this, function(result, excp) {
            this.__interface = result;
            if (callback) callback(this, result);
        }));
    },
    
    GetIpInterface: function (callback) {
        this.GetRemote("IpInterface", Lang.bind(this, function(result, excp) {
            this.__ipinterface = result;
            if (callback) callback(this, result);
        }));
    },
    
    OnStateChanged: function(callback) {
        this.connect("StateChanged", Lang.bind(this, function(sender, new_state, old_state, reason) {
            if (callback) callback(this, new_state, old_state, reason);
        }));
    },
    
    InvokeGetAll: function() {
        this.GetAllRemote(Lang.bind(this, this.__get_all_callback));
    },
    
    __get_all_callback: function(kwargs) {
        this.properties = kwargs;
    },
    
    toString: function() {
        return this.getPath();
    }
};

DBus.proxifyPrototype(NetworkManagerDevice.prototype, NetworkManagerDeviceInterface);
/* ********************   N E T W O R K   M A N A G E R   ******************** */


/** Holds almost all information about network interface.
 *  It also builds and updates GUI
 */
function NetInterface(if_name, ip, dev_type) {
  this._init(if_name, ip, dev_type);
};

NetInterface.prototype = {
  is_active: false, /* Is connected ?*/
  is_hidden: false,       /* Should show on panel? */
  onoff_menu: null, /* Switcher toggling "show" attribute */
  
  _init: function(if_name, ip, dev_type) {
    this.if_name = if_name;
    this.dev_type = dev_type;
    this.ip4 = ip;
    
    // TODO: Add 3G, Bluetooth and so on...
    let icon_name;
    
    switch(dev_type) {
        case NM_DEVICE_TYPE_ETHERNET:
            icon_name = "network-wired";
            break;
        case NM_DEVICE_TYPE_WIFI:
            icon_name = "network-wireless";
            break;
        default:
            icon_name = "network-wired";
            break;
    };
    
    this.icon = new St.Icon({
        icon_type: St.IconType.FULLCOLOR,
        icon_size: Main.panel.button.get_child().height,
        icon_name: icon_name
    });
    
    this.icon.add_effect_with_name("grayscale", new Clutter.DesaturateEffect({ factor: 1 }));
    
    this.box = new St.BoxLayout();
    this.box.add_actor(this.icon);
    
    this.label_in = new St.Label({ style_class: "bandwidth-label", text: "---" });
    this.label_out = new St.Label({ style_class: "bandwidth-label", text: "---" });
    
    this.box.add_actor(this.label_in);
    this.box.add_actor(this.label_out);
    
    this.bytes_in = 0;
    this.bytes_out = 0;
    this.last_probe_time = 0;
    
    this.speed_in = 0;
    this.speed_out = 0;
    
  },
  
  /** Searches for own interface name in net_dev and updates panel */  
  Update: function(net_dev, probe_time) {
    let dev = net_dev[this.if_name];
    if (!dev) return;

    let bytes_in_delta = dev["bytes_in"] - this.bytes_in;
    let bytes_out_delta = dev["bytes_out"] - this.bytes_out;

    this.bytes_in = dev["bytes_in"];
    this.bytes_out = dev["bytes_out"];
    
    let time_interval = (probe_time - this.last_probe_time) / 1000000;
    this.last_probe_time = probe_time;
    
    let speed_in = bytes_in_delta / time_interval;
    let speed_out = bytes_out_delta / time_interval;
    
    this.label_in.set_text(this.format_string(speed_in));    
    this.label_out.set_text(this.format_string(speed_out));
  },
  
  /** Formats bytes per second as IEC 60027-2 units
   *  For example: 483 B/s, 67.3 KiB/s, 1.28 MiB/s
   */
  format_string: function(Bps) {
    let unit = 0;

    while(Bps >= 1024) {
      Bps /= 1024;
      ++unit;
    }
    
    let precision = 0;
    if (unit > 0) {
      if (Bps < 10) precision = 2;
      else if (Bps < 100) precision = 1;
      precision = 3;
    }
    
    let label = Bps.toPrecision(3);
    if (unit == 0) label += " B/s";
    if (unit == 1) label += " KiB/s";
    if (unit == 2) label += " MiB/s";
    if (unit == 3) label += " GiB/s";   // envy

    return label;
  },
  
  GetIcon: function () {
    return this.icon;
  },
  
  GetBox: function() {
    return this.box;
  },
  
  Show: function() {
    this.box.show_all();
  },
  
  Hide: function() {
    this.box.hide_all();
  }
}

function NetSpeed() {
    this._init();
}


NetSpeed.prototype = {
    __proto__: PanelMenu.Button.prototype,
 
    active_interfaces: {},
 
    _init: function() {
        PanelMenu.Button.prototype._init.call(this, 0.0);

        this.network_manager = new NetworkManager();
        this.network_manager.OnDeviceAdded(Lang.bind(this, this.device_added));
        this.network_manager.OnDeviceRemoved(Lang.bind(this, this.device_removed));
        this.network_manager.InvokeGetDevices();
        
        this.ext_icon = new St.Icon({
            icon_type: St.IconType.FULLCOLOR,
            icon_size: Main.panel.button.get_child().height,
            icon_name: "network-offline"
        });
        
        this.main_box = new St.BoxLayout();
        this.main_box.add_actor(this.ext_icon);

        this.actor.set_child(this.main_box);
        Main.panel._rightBox.insert_actor(this.actor, 0);
 
        this.menu_section_interfaces = new PopupMenu.PopupMenuSection(_("Show interfaces"));
        
        let title = new PopupMenu.PopupMenuItem(_("Show interfaces when connected"), { reactive: false, style_class: "section-title" });
        this.menu_section_interfaces.addMenuItem(title);
        this.menu.addMenuItem(this.menu_section_interfaces);
        
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        this.menu_section_settings = new PopupMenu.PopupMenuSection("Settings");
        
        this.menu_section_settings.addAction(_("Network Settings"), function() {
            let app = Shell.AppSystem.get_default().get_app('gnome-network-panel.desktop');
            app.activate(-1);
        });
        
        this.menu.addMenuItem(this.menu_section_settings);
    },
 
    AddInterface: function(dev, net_dev) {
        this.active_interfaces[dev] = net_dev;
        let if_name = net_dev.if_name
        
        net_dev.GetBox().set_tooltip_text(if_name + " (" + net_dev.ip4 + ")")
        
        net_dev.is_hidden = (settings.get_strv("hidden-interfaces").indexOf(if_name) >= 0);
        net_dev.onoff_menu = new PopupMenu.PopupSwitchMenuItem(if_name, !net_dev.is_hidden);
        net_dev.onoff_menu.connect("toggled", Lang.bind(this, function(m) {
            net_dev.is_hidden = !m.state;
            this.ShowInterface(net_dev, m.state);
            
            list = settings.get_strv("hidden-interfaces");
            let i = list.indexOf(net_dev.if_name);
            
            // Update hidden iterfaces list
            if (m.state) {
                list.splice(i, 1);
            } else if (i < 0) {
                list.push(net_dev.if_name);
            }
            settings.set_strv("hidden-interfaces", list);
        }));
        this.menu_section_interfaces.addMenuItem(net_dev.onoff_menu);
        this.main_box.add_actor(net_dev.GetBox());
        this.ShowInterface(net_dev, true);
    },
    
    RemoveInterface: function(dev) {
        if (!(dev in this.active_interfaces)) return;
        let net_dev = this.active_interfaces[dev];
        net_dev.onoff_menu.destroy();
        this.main_box.remove_actor(net_dev.GetBox());
        delete this.active_interfaces[dev];
    },
 
    Run: function() {
      Mainloop.timeout_add(UPDATE_INTERVAL, Lang.bind(this, this.on_timeout));
    },
 
    /** Fired every UPDATE_INTERVAL milliseconds
     *  Gets current time, parses content of /proc/net/dev
     *  and updates all NetInterface instances.
     */ 
    on_timeout: function() {
      let probe_time = GLib.get_monotonic_time();
      let net_dev = {};
      let proc_net_dev = Shell.get_file_contents_utf8_sync('/proc/net/dev').split("\n");
      for(let i=2; i<proc_net_dev.length-1; ++i) {
        let iface_params = proc_net_dev[i].replace(/ +/g, " ").split(" ");
        let if_name = iface_params[1].replace(/:/, "");
        net_dev[if_name] = {
          "bytes_in": parseInt(iface_params[2]),
          "bytes_out": parseInt(iface_params[10])
        };
      }
      for each (let iface in this.active_interfaces)
        iface.Update(net_dev, probe_time);
      return true;
    },
    
    device_added: function(sender, dev) {
        dev.OnStateChanged(Lang.bind(this, this.device_state_changed));
        dev.GetState(Lang.bind(this, this.device_state_changed));
    },
    
    device_removed: function(sender, dev) {
        this.RemoveInterface(dev);
    },
    
    /** Callback fired when state of interface is changed
     *  Note that old_state and reason may be undefined
     */
    device_state_changed: function(sender, new_state, old_state, reason) {
        let net_dev = this.active_interfaces[sender];
        let if_name = sender.properties["Interface"];
        let ip_uint32 = sender.properties["Ip4Address"];
        let ip = ip_uint32 & 0xFF;
        
        for (let i=1; i<4; ++i)
            ip += ("." + (ip_uint32 >> i*8 & 0xFF));
        
        if (!net_dev) {
            net_dev = new NetInterface(if_name, ip, sender.properties["DeviceType"]);
            this.AddInterface(sender, net_dev);
        }
        
        if (new_state == NM_DEVICE_STATE_ACTIVATED) {
            net_dev.is_active = true;
            this.ShowInterface(net_dev, true);
        } else {
            net_dev.is_active = false;
            this.ShowInterface(net_dev, false);
        }
    },
 
    ShowInterface: function(net_dev, show) {
        let box = net_dev.GetBox();
        if (net_dev.is_active) {
            net_dev.onoff_menu.actor.remove_effect_by_name("grayscale");
            net_dev.onoff_menu.actor.reactive = true;
            net_dev.onoff_menu.label.set_text(net_dev.if_name);
        } else {
            if (!net_dev.onoff_menu.actor.get_effect("grayscale")) {
                let c = new Clutter.Color();
                c.from_string("darkgray");
                net_dev.onoff_menu.actor.add_effect_with_name("grayscale", new Clutter.ColorizeEffect({ tint: c }));
            }
            net_dev.onoff_menu.actor.reactive = false;
            net_dev.onoff_menu.label.set_text(net_dev.if_name + _(" (disconnected)"));
        }
        if (show && net_dev.is_active && !net_dev.is_hidden) {
            net_dev.Show();
        } else {
            net_dev.Hide();
        }
        this.ShowExtIcon();
    },
 
    /** Checks if there are any interfaces shown on the panel and if there are, hides "offline" icon.*/
    ShowExtIcon: function() {
        let has_devices = false;
        for each (let d in this.active_interfaces) {
            if (d.is_active && !d.is_hidden) {
                has_devices = true;
                break;
            }
        }
        if (has_devices) this.ext_icon.hide_all();
        else this.ext_icon.show_all();
    } 
};
 
function main(extensionMeta) {
    let userExtensionLocalePath = extensionMeta.path + '/locale';
    Gettext.bindtextdomain("NetMonitor", userExtensionLocalePath);
    Gettext.textdomain("NetMonitor");
  
    let net_speed = new NetSpeed();
    net_speed.Run();
}
