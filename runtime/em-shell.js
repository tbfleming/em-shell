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

        var req = new XMLHttpRequest();
        req.open("POST", 'service/spawn', false);
        req.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        req.send(JSON.stringify({ file: file, args: args }));
        if (req.status === 200) {
            return req.responseText | 0;
        } else
            return ERRNO_CODES.ENOMEM;
    }
});
