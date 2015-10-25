#include "em-shell.h"
#include <emscripten.h>
#include <errno.h>

#undef _exit

jmp_buf vfork_jump_buffer;
static int vfork_child_active = 0;
static int vfork_child_pid = 0;

static int em_createPid() {
    return 99; /* TODO: fetch new pid from service.js */
}

int em_vfork(int is_parent) {
    if (is_parent) {
        vfork_child_active = 0;
        errno = 0;
        return vfork_child_pid;
    }
    else {
        vfork_child_active = 1;
        vfork_child_pid = em_createPid();
        return 0;
    }
}

void em_vfork_exit(int status) {
    if (vfork_child_active)
        longjmp(vfork_jump_buffer, 1); /* TODO: send status to service.js */
    else
        _exit(status);
}

int js_spawn(const char *file, char *const argv[]);
int em_execvp(const char *file, char *const argv[]) {
    errno = js_spawn(file, argv);
    if (errno)
        return -1;
    else if (vfork_child_active)
        longjmp(vfork_jump_buffer, 1);
    else
        _exit(0); /* TODO: bypass sending status to service.js */
}
