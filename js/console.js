'use strict';
import Terminal from 'term';

console.log(Terminal);

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

function log(msg) {
    term.write(msg + '\r\n');
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

function spawn(file, args) {
    let w = new Worker("worker.js");
    w.postMessage({file: file, args: args});
}

function serviceActivated() {
    if(verboseService) {
        log('Connecting console to service');
        fetch('service/writeConsole', {method: 'post', body: 'Testing service/writeConsole\r\n'});
    }

    term.on('data', data => {
        navigator.serviceWorker.controller.postMessage({
            'command': 'consoleKeyPress',
            'consoleKeyPress': data
        });
    });

    let messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = e => {
        if (e.data.command == 'writeConsole')
            term.write(e.data.msg.replace('\n', '\r\n'));
        else if(e.data.command == 'spawn') {
            spawn('bin/busybox', e.data.args); // TODO: process e.data.file
            e.data.port.postMessage(0); // TODO: report real status
        }
    };

    navigator.serviceWorker.controller.postMessage({
        'command': 'setMasterPort',
        'port': messageChannel.port2}, 
        [messageChannel.port2]);

    spawn('bin/busybox', ['/bin/sh']);
}

term.open(document.getElementById('console'));
startService();
