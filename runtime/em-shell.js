mergeInto(LibraryManager.library, {
    js_fork: function () {
        return workerFork();
    },

    js_unfork: function (status) {
        return workerUnfork(status);
    },

    js_spawn: function (file, argv) {
        return workerSpawn(file, argv);
    },

    js_waitpid: function(childPid, statusPtr, options){
        return workerWaitpid(childPid, statusPtr, options);
    }
});
