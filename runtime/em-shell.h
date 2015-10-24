#include <unistd.h>
#include <setjmp.h>

extern jmp_buf vfork_jump_buffer;
int em_vfork(int is_parent);
void em_vfork_exit(int status);

#define vfork() (em_vfork(setjmp(vfork_jump_buffer)))
#define _exit(status) (em_vfork_exit(status))
#define _Exit(status) (em_vfork_exit(status))
