'use strict';

let prefix = this.registration.scope + 'service/';
let consoleInput = '';
let consoleInputWaiting = [];
let consoleOutput = '';
let consoleOutputPort = null;

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
    }
});

self.addEventListener('message', function (e) {
    if (!e.isTrusted)
        return;
    if (e.data.command == 'consoleSetOutputPort') {
        consoleOutputPort = e.data.port;
        consoleOutputPort.postMessage(consoleOutput);
        consoleOutput = '';
    } else if (e.data.command == 'consoleKeyPress') {
        if (consoleInputWaiting.length)
            consoleInputWaiting.splice(0, 1)[0](new Response(e.data.consoleKeyPress));
        else
            consoleInput += e.data.consoleKeyPress;
    }
});

function writeConsole(msg) {
    if (consoleOutputPort)
        consoleOutputPort.postMessage(msg);
    else
        consoleOutput += msg;
}
