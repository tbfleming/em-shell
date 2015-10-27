'use strict';

var serviceVersion = '0.0.4';
var serviceUrl = this.registration.scope + 'service';
var consoleInput = '';
var consoleInputWaiting = [];
var consoleOutput = '';
var masterPort = null;

console.log('service: starting');

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
    this.msgQueue = [];
    this.waiting = null;
    this.waitingAllowsAsyncMessages = true;
}

// Verify a process is valid. The cookie isn't for security; it's for making sure
// a process didn't outlive the service.
function verifyProcess(pid, cookie) {
    pid = pid | 0;
    return (
        pid < processes.length &&
        processes[pid] &&
        processes[pid].cookie === cookie &&
        processes[pid].status !== 'zombie');
}

function wait(process, resolve, waitingAllowsAsyncMessages) {
    process.waiting = resolve;
    process.waitingAllowsAsyncMessages = waitingAllowsAsyncMessages;
    if(process.waitingAllowsAsyncMessages && process.msgQueue.length)
        callWaiting(process, jsonReponse([{ command: 'ping' }]));
}

function callWaiting(process, response) {
    process.waiting(response);
    process.waiting = null;
}

function pingProcesses() {
    for(var process of processes) {
        if (process && process.waiting && process.waitingAllowsAsyncMessages) {
            callWaiting(process, jsonReponse([{ command: 'ping' }]));
        }
    }
}
setInterval(pingProcesses, 10000);

function processDied(pid, exitCode) {
    if (pid < 2)
        return;
    var process = processes[pid];
    process.status = 'zombie';
    process.msgQueue = [];
    process.waiting = null;

    for(childPid of process.childPids) {
        if (processes[childPid].status === 'zombie')
            processes[childPid] = null;
        else {
            // TODO: signal these like init would do
            // TODO: process groups?
            processes[childPid].parentPid = 1;
            processes[1].childPids.push(childPid);
        }
    }
    process.childPids = [];

    var parentProcess = processes[process.parentPid];
    let i = parentProcess.childPids.indexOf(pid);
    if (i >= 0)
        parentProcess.childPids.splice(i, 1);
    if (process.parentPid > 1)
        sendMsgToProcess(process.parentPid, { command: 'childDied', childPid: 'pid', exitCode: exitCode });
    else
        processes[pid] = null;
}

function jsonReponse(msg) {
    return new Response(JSON.stringify(msg));
}

function jsonResponseWithQueuedMessages(process, msg) {
    let q = process.msgQueue;
    process.msgQueue = [];
    q.push(msg);
    return jsonReponse(q);
}

function sendMsgToProcess(pid, msg) {
    let process = processes[pid];
    if (!process || process.status === 'zombie')
        return;
    if (process.waiting && process.waitingAllowsAsyncMessages)
        callWaiting(process, jsonResponseWithQueuedMessages(process, msg));
    else
        process.msgQueue.push(msg);
}

function processCmd(resolve, cmd) {
    let process = processes[cmd.pid];
    if (cmd.command == 'setMasterPort') {
        masterPort = cmd.port;
        masterPort.postMessage({ command: 'writeConsole', serviceVersion: serviceVersion, text: consoleOutput });
        consoleOutput = '';
    } else if (cmd.command == 'consoleKeyPress') {
        if (consoleInputWaiting.length) {
            for(var w of consoleInputWaiting)
                sendMsgToProcess(w, { command: 'ok', text: cmd.text });
            consoleInputWaiting = [];
        } else {
            consoleInput += cmd.text;
        }
    } else if (cmd.command === 'wait') {
        wait(process, resolve, true);
    } else if (cmd.command === 'ping') {
        resolve(jsonResponseWithQueuedMessages(process, { command: 'ping' }));
    } else if (cmd.command === 'readConsole') {
        if (consoleInput.length) {
            resolve(jsonResponseWithQueuedMessages(process, { command: 'ok', text: consoleInput }));
            consoleInput = '';
        } else {
            wait(process, resolve, true);
            consoleInputWaiting.push(cmd.pid);
        }
    } else if (cmd.command === 'writeConsole') {
        writeConsole(cmd.text);
        resolve(jsonResponseWithQueuedMessages(process, { command: 'ok' }));
    } else if (cmd.command === 'fork') {
        if (cmd.pid === 0)
            cmd.pid = 1;
        processes.push(new Process(cmd.pid));
        process.childPids.push(processes.length - 1);
        resolve(jsonReponse([{
            command: 'ok',
            childPid: processes.length - 1,
            childCookie: processes[processes.length - 1].cookie,
        }]));
    } else if (cmd.command === 'spawn') {
        if (cmd.pid)
            wait(process, resolve, false);
        masterPort.postMessage(cmd);
    } else if (cmd.command === 'processStarted') {
        if (process.waiting)
            callWaiting(process, jsonReponse([{ command: 'ok', errno: cmd.errno }]));
        // TODO: right now pending messages for the pid are all forwarded to the new
        //       spawn at the next command. Should these be filtered?
        resolve(jsonReponse([{ command: 'ok' }]));
    } else if (cmd.command === 'processExited') {
        processDied(cmd.pid, cmd.exitCode);
    } else {
        resolve(jsonReponse([{ command: 'terminate', reason: "I don't understand your command" }]));
        processDied(cmd.pid, 1); // TODO: what exit code?
    }
}

this.addEventListener('fetch', function (e) {
    // TODO: check for trusted

    //writeConsole('fetch ' + e.request.url + '\r\n');
    if (e.request.url !== serviceUrl)
        return;

    e.respondWith(new Promise(function (resolve) {
        e.request.json().then(function (cmd) {
            if (!verifyProcess(cmd.pid, cmd.cookie))
                resolve(jsonReponse([{ command: 'terminate', reason: "I don't know you" }]));
            processCmd(resolve, cmd);
        }).catch(function () {
            resolve(jsonReponse([{ command: 'terminate', reason: "exception processing request" }]));
        });
    }));
});

self.addEventListener('message', function (e) {
    if (!e.isTrusted)
        return;
    if (verifyProcess(e.data.pid, e.data.cookie)) {
        new Promise(function (dummy) {
            processCmd(dummy, e.data);
        }).catch(function (e) {
            console.log('service: caught exception processing message:', e);
        });
    }
});

function writeConsole(text) {
    if (masterPort)
        masterPort.postMessage({ command: 'writeConsole', text: text });
    else
        consoleOutput += text;
}
