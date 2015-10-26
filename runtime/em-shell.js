mergeInto(LibraryManager.library, {
    // TODO: send pid
    // TODO: send environment
    // TODO: send open file handles
    js_spawn: function (file, argv) {
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
        return sendSyncCmd({ command: 'spawn', file: file, args: args }).errno;
    }
});
