mergeInto(LibraryManager.library, {
    js_fork: function () {
        return workerFork();
    },

    js_unfork: function (status) {
        return workerUnfork(status);
    },

    js_spawn: function (file, argv) {
        return workerSpawn(file, argv);
    }
});
