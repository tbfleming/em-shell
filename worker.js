'use strict';

var pid = 0;
var cookie = 0;
var terminated = false;
var zombieChildren = [];
const debugCommands = false;

// Bit patterns for process status
// -------------------------------------------
// **** **** .000 0000     exited,   * = exit status
// 0000 0000 ?*** ****     signaled, * = non-0 term sig, ? = core dump
// **** **** 0111 1111     stopped,  * = non-0 stop sig
// 1111 1111 1111 1111     continued

const SIGKILL = 9;

// Terminate without sending any notifications to service
function terminateWorker() {
    terminated = true;
    abort();
}

function sendSyncCmd(cmd, requireOk) {
    cmd.pid = pid;
    cmd.cookie = cookie;
    let sendThis = cmd;
    while (true) {
        if (terminated)
            terminateWorker();

        if (debugCommands)
            console.log('worker', pid, ': send:', sendThis);

        var req = new XMLHttpRequest();
        req.open('POST', 'service', false);
        req.send(JSON.stringify(sendThis));
        if (req.status !== 200) {
            console.log('worker', pid, ': received status:', req.status, ' for request:', cmd);
            terminateWorker();
        }

        if (debugCommands) {
            console.log('worker', pid, ': sent:', cmd);
            console.log('worker', pid, ': revd:', req.responseText);
        }

        var results = JSON.parse(req.responseText);
        for(var result of results) {
            if (result.command === 'terminate') {
                console.log('worker', pid, ': received terminateWorker, reason: "' + result.reason + '" for request:', cmd);
                terminateWorker();
            } else if (result.command === 'childDied') {
                zombieChildren.push(result);
            } else if (result.command === 'ok') {
                return result;
            } else if (result.command !== 'ping') {
                console.log('worker', pid, ': received unrecognized result:', result, 'for request:', cmd);
                terminateWorker();
            }
        }
        if (!requireOk)
            return;
        sendThis = { command: 'wait', pid: cmd.pid, cookie: cmd.cookie };
    }
}

function print(x) {
    sendSyncCmd({ command: 'writeConsole', text: x + '' }, true);
}

function stdin() {
    return sendSyncCmd({ command: 'readConsole' }, true).text;
}

let forked = false;
let forkedFromPid = 0;
let forkedFromCookie = 0;
function workerFork() {
    let result = sendSyncCmd({ command: 'fork' }, true);
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
    let errno = sendSyncCmd({ command: 'spawn', file: file, args: args }, true).errno;
    if (debugCommands)
        console.log('spawn result:', errno);
    if (!errno) {
        if (forked) {
            pid = forkedFromPid;
            cookie = forkedFromCookie;
            forked = false;
        } else
            terminated = true;
    }
    return errno;
}

function workerWaitpid(childPid, statusPtr, options) {
    const WNOHANG = 1;
    let beenThroughLoop = false;
    //console.log('waitpid', childPid, statusPtr, options);

    // TODO: WUNTRACED?, WCONTINUED
    // TODO: childPid == 0, childPid < -1; right now it treats them like childPid == -1
    // TODO: notify service to remove zombie
    while (true) {
        for (var i = 0; i < zombieChildren.length; ++i) {
            if (childPid < 0 || zombieChildren[i].childPid == childPid) {
                if (statusPtr)
                    setValue(statusPtr, zombieChildren[i].exitCode, 'i32');
                let result = zombieChildren[i].childPid;
                zombieChildren.splice(i, 1);
                return result;
            }
        }
        if (options & WNOHANG) {
            if (beenThroughLoop)
                return 0;
            sendSyncCmd({ command: 'ping' }, false);
            beenThroughLoop = true;
        } else
            sendSyncCmd({ command: 'wait' }, false);
    }
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
var exitCode = 0;

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
        var result = sendSyncCmd({ command: 'fork' }, true);
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
        exitCode = EXITSTATUS << 8;
    } catch (e) {
        if (debugCommands)
            console.log('worker', pid, ': exception:', e);
        exitCode = SIGKILL;
    }

    if (!terminated)
        sendSyncCmd({ command: 'processExited', exitCode: exitCode });
    self.close();
});
