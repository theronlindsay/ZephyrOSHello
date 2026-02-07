/* window.js
 *
 * Copyright 2026 Theron
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
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';

export const ZephyroshelloWindow = GObject.registerClass({
    GTypeName: 'ZephyroshelloWindow',
    Template: 'resource:///buzz/zephyros/hello/window.ui',
    InternalChildren: ['label', 'hibernate', 'autostart_switch'],
}, class ZephyroshelloWindow extends Adw.ApplicationWindow {


    _init(application) {
        super._init({ 
            application,
            icon_name: 'buzz.zephyros.hello'
        });

        // Create the action 'hibernate'
        const action = new Gio.SimpleAction({ name: 'hibernate' });

        // Tell it what function to run when triggered
        action.connect('activate', () => this._onHibernate());

        // Add the action to the window
        this.add_action(action);

        this._setupAutostart();
    }

        _setupAutostart() {
            const appId = 'buzz.zephyros.hello';
            
            // We use flatpak-spawn --host to check for the file on the host
            // Since we can't easily query the host filesystem directly with Gio.File
            // without proper permissions, we'll use a shell command.
            let checkArgv = ['flatpak-spawn', '--host', 'test', '-f', 
                             GLib.build_filenamev([GLib.get_home_dir(), '.config', 'autostart', `${appId}.desktop`])];
            
            try {
                let [res, status] = GLib.spawn_sync(null, checkArgv, null, GLib.SpawnFlags.SEARCH_PATH, null);
                this._autostart_switch.active = (status === 0);
            } catch (e) {
                console.error(`Failed to check autostart status on host: ${e.message}`);
                this._autostart_switch.active = false;
            }
    
            const appIdConfig = 'buzz.zephyros.hello';
            const configDir = GLib.build_filenamev([GLib.get_user_config_dir(), appIdConfig]);
            const markerPath = GLib.build_filenamev([configDir, 'autostart-initialized']);
            const markerFile = Gio.File.new_for_path(markerPath);
    
            if (!markerFile.query_exists(null)) {
                // First run: Default state is ON
                this._autostart_switch.active = true;
                this._updateAutostart(true);
                try {
                    GLib.mkdir_with_parents(configDir, 0o755);
                    const stream = markerFile.create(Gio.FileCreateFlags.NONE, null);
                    if (stream) {
                        stream.close(null);
                    }
                } catch (e) {
                    // Ignore error if already exists or cannot create
                }
            }
    
            this._autostart_switch.connect('state-set', (widget, state) => {
                this._updateAutostart(state);
                return false;
            });
        }
    
        _updateAutostart(enabled) {
            const appId = 'buzz.zephyros.hello';
            const hostAutostartDir = GLib.build_filenamev([GLib.get_home_dir(), '.config', 'autostart']);
            const hostAutostartPath = GLib.build_filenamev([hostAutostartDir, `${appId}.desktop`]);
    
            if (enabled) {
                const content = `[Desktop Entry]
    Type=Application
    Name=ZephyrOS Hello
    Exec=buzz.zephyros.hello
    Icon=buzz.zephyros.hello
    X-GNOME-Autostart-enabled=true
    `;
                // Use flatpak-spawn --host to write the file
                // We use printf to handle the newline and redirection to create the file
                let command = `mkdir -p ${hostAutostartDir} && printf '${content.replace(/'/g, "'\\''")}' > ${hostAutostartPath}`;
                let argv = ['flatpak-spawn', '--host', 'sh', '-c', command];
    
                try {
                    GLib.spawn_async(null, argv, null, GLib.SpawnFlags.SEARCH_PATH, null);
                } catch (e) {
                    console.error(`Failed to enable autostart on host: ${e.message}`);
                }
            } else {
                let argv = ['flatpak-spawn', '--host', 'rm', '-f', hostAutostartPath];
                try {
                    GLib.spawn_async(null, argv, null, GLib.SpawnFlags.SEARCH_PATH, null);
                } catch (e) {
                    console.error(`Failed to disable autostart on host: ${e.message}`);
                }
            }
        }
    _onHibernate() {
        // The command logic goes here
        console.log("Attempting to setup hibernate...");
        this._hibernate.label = "Setting up...";
        this._hibernate.sensitive = false; // Prevent double-clicks while running

        // 1. Prepare the command (pkexec for root permission)
        // We add 'flatpak-spawn' and '--host' to the start of the command
        let argv = ['flatpak-spawn', '--host', 'pkexec', 'sh', '-c',
                    '/usr/bin/setupHibernate.sh'
                    ];

        // 2. Launch it
        let launcher = new Gio.SubprocessLauncher({
            flags: Gio.SubprocessFlags.NONE
        });

        try {

            let launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.NONE
            });

            let process = launcher.spawnv(argv);

            // Optional: Notify user command was sent
            process.wait_check_async(null, (proc, result) => {
                try {
                    if (proc.wait_check_finish(result)) {
                        // --- SUCCESS STATE ---
                        this._hibernate.label = "Setup Complete ✅";
                        this._hibernate.remove_css_class('suggested-action'); // Remove blue color
                        // Button remains insensitive (unclickable)
                    }
                } catch (e) {
                    // --- ERROR STATE ---
                    console.error("Failed: " + e.message);
                    this._hibernate.label = "Setup Failed ❌";
                    this._hibernate.add_css_class('destructive-action'); // Turn red
                    this._hibernate.sensitive = true; // Let them try again
                }
            });

        } catch (e) {
            console.error("Failed to launch pkexec: " + e.message);
            this._hibernate.sensitive = true; // Re-enable if launch failed completely
        }
    }
});

