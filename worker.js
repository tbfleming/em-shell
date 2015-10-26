'use strict';

var pid = 0;
var cookie = 0;
var terminated = false;

function terminateWorker() {
    terminated = true;
    abort();
}

function sendSyncCmd(cmd) {
    if (terminated)
        terminateWorker();
    cmd.pid = pid;
    cmd.cookie = cookie;
    var req = new XMLHttpRequest();
    req.open('POST', 'service', false);
    req.send(JSON.stringify(cmd));
    if (req.status !== 200) {
        console.log('worker: received status:', req.status, ' for request:', cmd);
        terminateWorker();
    }

    console.log(cmd.command);
    console.log(req.responseText);

    var result = JSON.parse(req.responseText);
    if (result.command === 'terminate') {
        console.log('worker: received terminateWorker, reason: "' + result.reason + '" for request:', cmd);
        terminateWorker();
    } else if (result.command === 'ok') {
        return result;
    } else {
        console.log('worker: received unrecognized result:', result, 'for request:', cmd);
        terminateWorker();
    }
}

function print(x) {
    sendSyncCmd({ command: 'writeConsole', text: x });
}

function stdin() {
    return sendSyncCmd({ command: 'readConsole' }).text;
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
addEventListener('message', function (e) {
    if (!e.isTrusted || Module)
        return;

    console.log(e.data);
    pid = e.data.pid;
    cookie = e.data.cookie;

    if (!pid) {
        console.log('worker: fork from pid 0');
        var result = sendSyncCmd({ command: 'fork' });
        pid = result.childPid;
        cookie = result.childCookie;
    }
    console.log('worker: pid', pid);

    // TODO:
    // if (e.data.releaseWaitingExec)
    //     sendSyncCmd({ command: 'releaseWaitingExec' });

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

    // TODO: notify service of start and termination
    try {
        importScripts(e.data.file);
    } catch (e) {
        console.log(e);
    }
    self.close();
});
