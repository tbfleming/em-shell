#include "em-shell.h"

jmp_buf vfork_jump_buffer;
static int vfork_child_active = 0;
static int vfork_child_pid = 0;

int em_vfork(int is_parent) {
    if (is_parent) {
        vfork_child_active = 0;
        return vfork_child_pid;
    }
    else {
        vfork_child_active = 1;
        vfork_child_pid = 99; /* TODO: fetch new pid from service.js */
        return 0;
    }
}

#undef _exit
void em_vfork_exit(int status) {
    if (vfork_child_active)
        longjmp(vfork_jump_buffer, 1); /* TODO: send status to service.js if exec...() wasn't called */
    else
        _exit(status);
}
