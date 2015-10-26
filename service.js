'use strict';

var serviceUrl = this.registration.scope + 'service';
var consoleInput = '';
var consoleInputWaiting = [];
var consoleOutput = '';
var masterPort = null;

console.log('starting');

var processes = [];
processes = [new Process(0), new Process(0)];

// Non-worker scripts use pid 0
processes[0].cookie = 0;

function Process(parentPid) {
    this.pid = processes.length;
    this.cookie = Math.floor(Math.random() * 0x80000000);
    this.parentPid = parentPid;
    this.status = 'running'; // running, zombie
    this.childPids = [];
}

// Verify a process is valid. The cookie isn't for security; it's for making sure
// a process didn't outlive the service.
function processGood(pid, cookie) {
    pid = pid | 0;
    return (
        pid < processes.length &&
        processes[pid] &&
        processes[pid].cookie === cookie &&
        processes[pid].status !== 'zombie');
}

function processDied(pid) {
    var process = processes[pid];
    process.status = 'zombie';

    // TODO: process group?
    for(childPid of process.childPids)
        processes[childPid].parentPid = 1;

    // TODO: notify parent
}

function jsonReponse(j) {
    return new Response(JSON.stringify(j));
}

function processCmd(resolve, cmd) {
    if (cmd.command == 'setMasterPort') {
        masterPort = cmd.port;
        masterPort.postMessage({ command: 'writeConsole', text: consoleOutput });
        consoleOutput = '';
    } else if (cmd.command == 'consoleKeyPress') {
        if (consoleInputWaiting.length) {
            for(var w of consoleInputWaiting)
                w(jsonReponse({ command: 'ok', text: cmd.text }));
            consoleInputWaiting = [];
        } else {
            consoleInput += cmd.text;
        }
    } else if (cmd.command === 'readConsole') {
        if (consoleInput.length) {
            resolve(jsonReponse({ command: 'ok', text: consoleInput }));
            consoleInput = '';
        } else {
            consoleInputWaiting.push(resolve);
        }
    } else if (cmd.command === 'writeConsole') {
        writeConsole(cmd.text);
        resolve(jsonReponse({ command: 'ok' }));
    } else if (cmd.command === 'fork') {
        if (cmd.pid === 0)
            cmd.pid = 1;
        processes.push(new Process(cmd.pid));
        processes[cmd.pid].childPids.push(processes.length - 1);
        resolve(jsonReponse({
            command: 'ok',
            childPid: processes.length - 1,
            childCookie: processes[processes.length - 1].cookie,
        }));
    } else if (cmd.command === 'spawn') {
        var messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = function (e) { resolve(jsonReponse(cmd)) };
        cmd.port = messageChannel.port2;
        masterPort.postMessage(cmd, [messageChannel.port2]);
    } else {
        resolve(jsonReponse({ command: 'terminate', reason: "I don't understand your command" }));
        processDied(cmd.pid);
    }
}

this.addEventListener('fetch', function (e) {
    // TODO: check for trusted

    //writeConsole('fetch ' + e.request.url + '\r\n');
    if (e.request.url !== serviceUrl)
        return;

    e.respondWith(new Promise(function (resolve) {
        e.request.json().then(function (cmd) {
            if (!processGood(cmd.pid, cmd.cookie))
                resolve(jsonReponse({ command: 'terminate', reason: "I don't know you" }));
            processCmd(resolve, cmd);
        }).catch(function () {
            resolve(jsonReponse({ command: 'terminate', reason: "exception processing request" }));
        });
    }));
});

self.addEventListener('message', function (e) {
    if (!e.isTrusted)
        return;
    if (processGood(e.data.pid, e.data.cookie)) {
        new Promise(function (dummy) {
            processCmd(dummy, e.data);
        }).catch(function (e) {
            console.log('caught exception processing message:', e);
        });
    }
});

function writeConsole(text) {
    if (masterPort)
        masterPort.postMessage({ command: 'writeConsole', text: text });
    else
        consoleOutput += text;
}
