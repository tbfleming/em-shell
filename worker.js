'use strict';

var pid = 0;
var cookie = 0;
var terminated = false;
const debugCommands = false;

function terminateWorker() {
    terminated = true;
    abort();
}

function sendSyncCmd(cmd) {
    if (terminated)
        terminateWorker();
    cmd.pid = pid;
    cmd.cookie = cookie;

    if (debugCommands)
        console.log('worker', pid, ': send:', cmd);

    var req = new XMLHttpRequest();
    req.open('POST', 'service', false);
    req.send(JSON.stringify(cmd));
    if (req.status !== 200) {
        if (debugCommands)
            console.log('worker', pid, ': received status:', req.status, ' for request:', cmd);
        terminateWorker();
    }

    if (debugCommands) {
        console.log('worker', pid, ': sent:', cmd);
        console.log('worker', pid, ': revd:', req.responseText);
    }

    var result = JSON.parse(req.responseText);
    if (result.command === 'terminate') {
        if (debugCommands)
            console.log('worker', pid, ': received terminateWorker, reason: "' + result.reason + '" for request:', cmd);
        terminateWorker();
    } else if (result.command === 'ok') {
        return result;
    } else {
        if (debugCommands)
            console.log('worker', pid, ': received unrecognized result:', result, 'for request:', cmd);
        terminateWorker();
    }
}

function print(x) {
    sendSyncCmd({ command: 'writeConsole', text: x });
}

function stdin() {
    return sendSyncCmd({ command: 'readConsole' }).text;
}

let forked = false;
let forkedFromPid = 0;
let forkedFromCookie = 0;
function workerFork() {
    let result = sendSyncCmd({ command: 'fork' });
    forkedFromPid = pid;
    forkedFromCookie = cookie;
    pid = result.childPid;
    cookie = result.childCookie;
    forked = true;
    return pid;
}

function workerUnfork(status) {
    forked = false;
    pid = forkedFromPid;
    cookie = forkedFromCookie;
}

// TODO: send environment
// TODO: send open file handles
let dieBecauseOfSpawn = false;
function workerSpawn(file, argv) {
    'use strict';
    file = Pointer_stringify(file);
    var args = [];
    while (true) {
        var arg = getValue(argv, '*');
        if (arg === 0)
            break;
        args.push(Pointer_stringify(arg));
        argv += 4;
    }
    let errno = sendSyncCmd({ command: 'spawn', file: file, args: args }).errno;
    if (debugCommands)
        console.log('spawn result:', errno);
    if (!errno) {
        if (forked) {
            pid = forkedFromPid;
            cookie = forkedFromCookie;
            forked = false;
        } else
            dieBecauseOfSpawn = true;
    }
    return errno;
}

var consoleInputBuffer = [];
var consoleInputBufferUsed = 0;
var consoleOps = {
    open: function (stream) {
        stream.tty = true;
        stream.seekable = false;
    },
    close: function (stream) {
    },
    flush: function (stream) {
    },
    read: function (stream, buffer, offset, length, pos) {
        while (consoleInputBufferUsed >= consoleInputBuffer.length) {
            consoleInputBuffer = intArrayFromString(stdin() + '', true);
            consoleInputBufferUsed = 0;
        }
        var bytesRead = Math.min(length, consoleInputBuffer.length - consoleInputBufferUsed);
        for (var i = 0; i < bytesRead; ++i)
            buffer[offset + i] = consoleInputBuffer[consoleInputBufferUsed + i];
        consoleInputBufferUsed += bytesRead;
        if (bytesRead)
            stream.node.timestamp = Date.now();
        return bytesRead;
    },
    write: function (stream, buffer, offset, length, pos) {
        // TODO: is buffer always the heap? If not, is there an alternative to Pointer_stringify?
        print(Pointer_stringify(offset, length));
        if (length)
            stream.node.timestamp = Date.now();
        return length;
    }
};

var Module;
var EXITSTATUS = 0;

addEventListener('message', function (e) {
    if (!e.isTrusted || Module)
        return;

    if (debugCommands)
        console.log('new worker: received:', e.data);
    pid = e.data.pid;
    cookie = e.data.cookie;

    if (!pid) {
        if (debugCommands)
            console.log('worker: fork from pid 0');
        var result = sendSyncCmd({ command: 'fork' });
        pid = result.childPid;
        cookie = result.childCookie;
        if (debugCommands)
            console.log('worker: pid = ', pid);
    }

    Module = {
        thisProgram: e.data.args.shift(),
        arguments: e.data.args,
        print: print,
        printErr: print,
        preInit: function () {
            FS.registerDevice(FS.makedev(5, 0), consoleOps);
            FS.registerDevice(FS.makedev(6, 0), consoleOps);
        }
    };

    // TODO: this blindly assumes e.data.file loads
    sendSyncCmd({ command: 'processStarted', spawnRequest: e.data.spawnRequest, errno: 0 });

    try {
        importScripts(e.data.file);
    } catch (e) {
        if (debugCommands)
            console.log('worker', pid, ': exception:', e);
        if (!EXITSTATUS)
            EXITSTATUS = 1;
    }

    if (!dieBecauseOfSpawn)
        sendSyncCmd({ command: 'processExited', exitCode: EXITSTATUS });
    self.close();
});
