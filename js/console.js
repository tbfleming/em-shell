'use strict';

require.config({ baseUrl: ".", });
require(["js/term.js-0.0.7/src/term.js"], function () {
    var term = new Terminal({});
    let verboseService = false;
    let activeService = null;
    let serviceVersion = 'x.y';
    let receivedServiceVersion = false;

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
            if (e.data.command == 'writeConsole') {
                if (receivedServiceVersion)
                    term.write(e.data.text.replace('\n', '\r\n'));
                else if (e.data.serviceVersion != serviceVersion) {
                    log('Expected service worker version: ' + serviceVersion);
                    log('Received service worker version: ' + e.data.serviceVersion + '\r\n');
                    log('Leave this page then come back to refresh versions, or');
                    log('*shift-click* the refresh button.');
                    messageChannel.port1.close();
                } else {
                    receivedServiceVersion = true;
                    term.write(e.data.text.replace('\n', '\r\n'));
                    spawn('bin/busybox', {
                        'pid': 0,
                        'cookie': 0,
                        'command': 'spawn',
                        'file': 'bin/busybox.js',
                        'args': ['/bin/sh']
                    });
                }
            } else if (e.data.command == 'spawn') {
                spawn('bin/busybox.js', e.data); // TODO: process e.data.file
            }
        };

        navigator.serviceWorker.controller.postMessage({
            'pid': 0,
            'cookie': 0,
            'command': 'setMasterPort',
            'port': messageChannel.port2}, 
            [messageChannel.port2]);
    }

    term.open(document.getElementById('console'));

    fetch('service.js')
        .then(r => {
            if (r.status != 200)
                throw r.status;
            return r.text();
        })
        .then(t => {
            serviceVersion = (new RegExp("serviceVersion = '([^']*)'")).exec(t)[1];
            startService();
        })
        .catch(e => {
            log(e + ' while fetching service.js');
        });
});
