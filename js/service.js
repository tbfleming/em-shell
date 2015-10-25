'use strict';

let prefix = this.registration.scope + 'service/';
let consoleInput = '';
let consoleInputWaiting = [];
let consoleOutput = '';
let masterPort = null;

console.log('starting');

this.addEventListener('fetch', function (e) {
    // TODO: check for trusted

    //writeConsole('fetch ' + e.request.url + '\r\n');
    if (!e.request.url.startsWith(prefix))
        return;
    let path = e.request.url.substring(prefix.length);

    if (path === 'check')
        e.respondWith(new Response('connected'));
    else if (path === 'readConsole') {
        if (consoleInput.length) {
            e.respondWith(new Response(consoleInput));
            consoleInput = '';
        } else {
            e.respondWith(new Promise(function (resolve, reject) {
                consoleInputWaiting.push(resolve);
            }));
        }
    } else if (path === 'writeConsole') {
        e.request.text().then(writeConsole);
        e.respondWith(new Response(''));
    } else if (path === 'spawn') {
        e.respondWith(new Promise(function (resolve, reject) {
            e.request.json().then(j => {
                let messageChannel = new MessageChannel();
                messageChannel.port1.onmessage = e => resolve(new Response(e.data));
                j.command = path;
                j.port = messageChannel.port2;
                masterPort.postMessage(j, [messageChannel.port2]);
            });
        }));
    } else
        writeConsole('fetch ' + e.request.url + '\r\n');
});

self.addEventListener('message', function (e) {
    if (!e.isTrusted)
        return;
    if (e.data.command == 'setMasterPort') {
        masterPort = e.data.port;
        masterPort.postMessage({ command: 'writeConsole', msg: consoleOutput });
        consoleOutput = '';
    } else if (e.data.command == 'consoleKeyPress') {
        if (consoleInputWaiting.length) {
            for(let w of consoleInputWaiting)
                w(new Response(e.data.consoleKeyPress));
            consoleInputWaiting = [];
        } else
            consoleInput += e.data.consoleKeyPress;
    }
});

function writeConsole(msg) {
    if (masterPort)
        masterPort.postMessage({ command: 'writeConsole', msg: msg });
    else
        consoleOutput += msg;
}
