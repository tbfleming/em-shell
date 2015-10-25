'use strict';

function syncGet(url) {
    var req = new XMLHttpRequest();
    req.open("GET", url, false);
    req.send();
    if (req.status === 200)
        return req.responseText;
}

function syncPost(url, data) {
    var req = new XMLHttpRequest();
    req.open("POST", url, false);
    req.send(data);
}

function print(x) {
    syncPost('service/writeConsole', x);
}

function stdin() {
    return syncGet('service/readConsole');
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
