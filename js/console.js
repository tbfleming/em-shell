'use strict';
import Terminal from 'term';

console.log(Terminal);

var term = new Terminal({});

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
        log('Registering service worker...');
        navigator.serviceWorker.register('boot-service.js', { scope: './' }).then(reg => {
            log('Registration succeeded. Scope is ' + reg.scope);
            log('Checking service...');
            fetch('service/check')
                .then(r => {
                    if(r.status === 200)
                        return r.text();
                    else
                        throw r.status + ' ' + r.statusText;
                })
                .then(r => {
                    log('Received: ' + r);
                    if(r === 'connected')
                        serviceConnected();
                    else {
                        log('Reloading page...');
                        setTimeout(() => location.reload(), 1500);
                    }
                })
                .catch(e => log(e));
        }).catch(function(error) {
            log('Registration failed with ' + error);
        });
    } else {
        log('error: this browser does not support service workers');
    }
}

function spawn(file, args) {
    let w = new Worker("boot-worker.js");
    w.postMessage({file: file, args: args});
}

function serviceConnected() {
    log('Connecting console to service');

    fetch('service/writeConsole', {method: 'post', body: 'Testing service/writeConsole\r\n'});

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
