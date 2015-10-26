'use strict';

require.config({ baseUrl: ".", });
require(["js/term.js-0.0.7/src/term.js"], function () {
    var term = new Terminal({});
    let verboseService = false;
    let activeService = null;

    //let line = '';
    //term.on('data', function (data) {
    //    for(let i = 0; i < data.length; ++i) {
    //        let ch = data.charCodeAt(i);
    //        if(ch >= 32 && ch < 127) {
    //            line += data[i];
    //            term.write(data[i]);
    //        } else if((ch == 8 || ch == 127) && line.length > 0) {
    //            line = line.substr(0, line.length - 1);
    //            term.write('\b \b');
    //        } else if(ch == 10 || ch == 13) {
    //            term.write('\r\n');
    //            console.log(line);
    //            line = '';
    //        }
    //    }
    //});

    term.on('title', function (title) {
        document.title = title;
    });

    function log(text) {
        term.write(text + '\r\n');
    }

    function startService() {
        if ('serviceWorker' in navigator) {
            if(verboseService)
                log('Registering service worker...');
            navigator.serviceWorker.register('service.js', { scope: './' }).then(reg => {
                let check = () => {
                    if(reg.active.state !== 'activated') {
                        reg.active.onstatechange = check;
                        verboseService = true;
                    }
                    if(verboseService)
                        log('Service worker: ' + reg.active.state);
                    if(reg.active.state === 'activated' && !activeService) {
                        activeService = reg.active;
                        if(navigator.serviceWorker.controller === activeService)
                            serviceActivated();
                        else {
                            log('New service worker installed');
                            log('Reloading page...');
                            setTimeout(() => location.reload(), 1500);
                        }
                    }
                };
                navigator.serviceWorker.ready.then(check);
            }).catch(function(error) {
                log('Service registration failed: ' + error);
            });
        } else {
            log('error: this browser does not support service workers');
        }
    } // startService()

    function spawn(file, cmd) {
        let w = new Worker("worker.js");
        cmd.file = file;
        w.postMessage(cmd);
    }

    function serviceActivated() {
        if(verboseService)
            log('Connecting console to service');

        term.on('data', data => {
            navigator.serviceWorker.controller.postMessage({
                'pid': 0,
                'cookie': 0,
                'command': 'consoleKeyPress',
                'text': data
            });
        });

        let messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = e => {
            if (e.data.command == 'writeConsole')
                term.write(e.data.text.replace('\n', '\r\n'));
            else if(e.data.command == 'spawn') {
                e.data.port.postMessage({command:'ok', errno:0}); // TODO: report real status
                e.data.port = null;
                spawn('bin/busybox', e.data); // TODO: process e.data.file
            }
        };

        navigator.serviceWorker.controller.postMessage({
            'pid': 0,
            'cookie': 0,
            'command': 'setMasterPort',
            'port': messageChannel.port2}, 
            [messageChannel.port2]);

        spawn('bin/busybox', {
            'pid': 0,
            'cookie': 0,
            'command': 'spawn',
            'file': 'bin/busybox',
            'args': ['/bin/sh']});
    }

    term.open(document.getElementById('console'));
    startService();
});
