/**
 * Process trees under login shells, copied from the lab export with paths and versions replaced
 * by placeholders: `{home}`, `{node}`, `{cursor_version}` and `{pid}` (the shell's own pid).
 * One node per line, indented two spaces per level: `s <exit>` is a subshell that only ran builtins
 * (`fork,end`), `x <exit> [name, executable, args]` a command (`fork,exec,end`).
 */

/** Children of Claude's `bash -c -l SNAPSHOT_FILE=...` preamble for a user whose login shell sources nvm (lab run 7). */
export const CLAUDE_PREAMBLE_NVM = String.raw`
x 0 ["id", "/usr/bin/id", ["/usr/bin/id", "-un"]]
s 0
  x 0 ["hostnamectl", "/usr/bin/hostnamectl", ["/usr/bin/hostnamectl", "--transient"]]
x 0 ["bash", "/usr/bin/bash", ["/usr/bin/sh", "/usr/libexec/grepconf.sh", "-c"]]
  x 1 ["grep", "/usr/bin/grep", ["grep", "-qsi", "^COLOR.*none", "/etc/GREP_COLORS"]]
x 0 ["bash", "/usr/bin/bash", ["/usr/bin/sh", "/usr/libexec/grepconf.sh", "-c"]]
  x 1 ["grep", "/usr/bin/grep", ["grep", "-qsi", "^COLOR.*none", "/etc/GREP_COLORS"]]
x 0 ["bash", "/usr/bin/bash", ["/usr/bin/sh", "/usr/libexec/grepconf.sh", "-c"]]
  x 1 ["grep", "/usr/bin/grep", ["grep", "-qsi", "^COLOR.*none", "/etc/GREP_COLORS"]]
s 0
  x 1 ["cat", "/usr/bin/cat", ["cat", "/dev/null", "/etc/debuginfod/*.urls"]]
  x 0 ["tr", "/usr/bin/tr", ["tr", "\\n", " "]]
s 0
  x 0 ["locale", "/usr/bin/locale", ["/usr/bin/locale"]]
x 0 ["sed", "/usr/bin/sed", ["/usr/bin/sed", "-r", "-e", "s/^[[:blank:]]*([[:upper:]_]+)=([[:print:][:digit:]\\._-]+|\"[[:print:][:digit:]\\._-]+\")/export \\1=\\2/;t;d", "/etc/locale.conf"]]
x 0 ["cat", "/usr/bin/cat", ["cat", "/proc/{pid}/comm"]]
s 0
  s 0
    x 0 ["which", "/usr/bin/which", ["which", "node"]]
  s 0
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node/v{node}/bin/node"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node/v{node}/bin"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node/v{node}"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "/home"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node/v{node}/bin/node"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node/v{node}/bin"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node/v{node}"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions"]]
  s 0
    x 0 ["node", "{home}/.nvm/versions/node/v{node}/bin/node", ["node", "--version"]]
s 0
  s 0
  x 0 ["tr", "/usr/bin/tr", ["tr", "t", "\\t"]]
s 0
  s 0
  s 0
  s 0
    s 0
      s 0
      s 0
      s 0
      s 0
      s 0
      s 0
        s 0
          s 0
            s 2
              s 0
                s 0
                  s 0
                  x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
              s 0
                s 0
            x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
            x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
        s 0
        s 0
      s 2
        s 0
          s 0
            s 2
              s 0
                s 0
                  s 0
                  x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
              s 0
                s 0
            x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
            x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
        s 0
        s 0
      s 0
        s 0
          s 0
            s 0
          x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s/^\\([0-9]\\)/v\\1/g"]]
      s 0
        s 0
          s 0
          x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s/[^\\.]//g"]]
      s 0
        x 0 ["uname", "/usr/bin/uname", ["uname", "-a"]]
      s 0
        x 3 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN {\n    if (ARGV[1] == \"\" || ARGV[2] == \"\") exit(1)\n    split(ARGV[1], a, /\\./);\n    split(ARGV[2], b, /\\./);\n    for (i=1; i<=3; i++) {\n      if (a[i] && a[i] !~ /^[0-9]+$/) exit(2);\n      if (b[i] && b[i] !~ /^[0-9]+$/) { exit(0); }\n      if (a[i] < b[i]) exit(3);\n      else if (a[i] > b[i]) exit(0);\n    }\n    exit(4)\n  }", "0.12.0", "{node}"]]
        s 0
    x 0 ["tail", "/usr/bin/tail", ["tail", "-1"]]
s 0
  s 0
    s 0
      s 0
      s 0
      s 0
      s 0
      s 0
      s 0
        s 0
          s 0
            s 2
              s 0
                s 0
                  s 0
                  x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
              s 0
                s 0
            x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
            x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
        s 0
        s 0
      s 2
        s 0
          s 0
            s 2
              s 0
                s 0
                  s 0
                  x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
              s 0
                s 0
            x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
            x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
        s 0
        s 0
      s 0
        s 0
          s 0
            s 0
          x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s/^\\([0-9]\\)/v\\1/g"]]
      s 0
        s 0
          s 0
          x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s/[^\\.]//g"]]
      s 0
        x 0 ["uname", "/usr/bin/uname", ["uname", "-a"]]
      s 0
        x 3 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN {\n    if (ARGV[1] == \"\" || ARGV[2] == \"\") exit(1)\n    split(ARGV[1], a, /\\./);\n    split(ARGV[2], b, /\\./);\n    for (i=1; i<=3; i++) {\n      if (a[i] && a[i] !~ /^[0-9]+$/) exit(2);\n      if (b[i] && b[i] !~ /^[0-9]+$/) { exit(0); }\n      if (a[i] < b[i]) exit(3);\n      else if (a[i] > b[i]) exit(0);\n    }\n    exit(4)\n  }", "0.12.0", "{node}"]]
        s 0
    x 0 ["tail", "/usr/bin/tail", ["tail", "-1"]]
  s 0
s 0
  x 0 ["uname", "/usr/bin/uname", ["uname", "-a"]]
s 0
  x 3 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN {\n    if (ARGV[1] == \"\" || ARGV[2] == \"\") exit(1)\n    split(ARGV[1], a, /\\./);\n    split(ARGV[2], b, /\\./);\n    for (i=1; i<=3; i++) {\n      if (a[i] && a[i] !~ /^[0-9]+$/) exit(2);\n      if (b[i] && b[i] !~ /^[0-9]+$/) { exit(0); }\n      if (a[i] < b[i]) exit(3);\n      else if (a[i] > b[i]) exit(0);\n    }\n    exit(4)\n  }", "0.12.0", "{node}"]]
  s 0
s 0
  x 3 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN {\n    if (ARGV[1] == \"\" || ARGV[2] == \"\") exit(1)\n    split(ARGV[1], a, /\\./);\n    split(ARGV[2], b, /\\./);\n    for (i=1; i<=3; i++) {\n      if (a[i] && a[i] !~ /^[0-9]+$/) exit(2);\n      if (b[i] && b[i] !~ /^[0-9]+$/) { exit(0); }\n      if (a[i] < b[i]) exit(3);\n      else if (a[i] > b[i]) exit(0);\n    }\n    exit(4)\n  }", "0.12.0", "{node}"]]
  s 0
s 0
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-q", "{home}/.nvm/[^/]*/bin"]]
  s 0
  s 0
    x 0 ["grep", "/usr/bin/grep", ["grep", "-q", "{home}/.nvm/versions/[^/]*/[^/]*/bin"]]
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-Eq", "(^|:)(/usr(/local)?)?/bin:.*{home}/.nvm/[^/]*/bin"]]
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-Eq", "(^|:)(/usr(/local)?)?/bin:.*{home}/.nvm/versions/[^/]*/[^/]*/bin"]]
  s 0
  x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s#{home}/.nvm/[^/]*/bin[^:]*#{home}/.nvm/versions/node/v{node}/bin#", "-e", "s#{home}/.nvm/versions/[^/]*/[^/]*/bin[^:]*#{home}/.nvm/versions/node/v{node}/bin#"]]
x 0 ["manpath", "/usr/bin/manpath", ["manpath"]]
s 0
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-q", "{home}/.nvm/[^/]*/share/man"]]
  s 0
  s 0
    x 0 ["grep", "/usr/bin/grep", ["grep", "-q", "{home}/.nvm/versions/[^/]*/[^/]*/share/man"]]
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-Eq", "(^|:)(/usr(/local)?)?/share/man:.*{home}/.nvm/[^/]*/share/man"]]
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-Eq", "(^|:)(/usr(/local)?)?/share/man:.*{home}/.nvm/versions/[^/]*/[^/]*/share/man"]]
  s 0
  x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s#{home}/.nvm/[^/]*/share/man[^:]*#{home}/.nvm/versions/node/v{node}/share/man#", "-e", "s#{home}/.nvm/versions/[^/]*/[^/]*/share/man[^:]*#{home}/.nvm/versions/node/v{node}/share/man#"]]
s 0
  x 0 ["uname", "/usr/bin/uname", ["uname", "-a"]]
x 0 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN { for (name in ENVIRON) if (toupper(name) == \"NPM_CONFIG_PREFIX\") { print name; break } }"]]
s 0
s 0
  s 0
    x 0 ["which", "/usr/bin/which", ["which", "node"]]
  s 0
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node/v{node}/bin/node"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node/v{node}/bin"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node/v{node}"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "/home"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node/v{node}/bin/node"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node/v{node}/bin"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node/v{node}"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions/node"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.nvm/versions"]]
  s 0
    x 0 ["node", "{home}/.nvm/versions/node/v{node}/bin/node", ["node", "--version"]]
s 0
  s 0
  x 0 ["tr", "/usr/bin/tr", ["tr", "t", "\\t"]]
s 0
  s 0
  s 0
  s 0
    s 0
      s 0
      s 0
      s 0
      s 0
      s 0
      s 0
        s 0
          s 0
            s 2
              s 0
                s 0
                  s 0
                  x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
              s 0
                s 0
            x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
            x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
        s 0
        s 0
      s 2
        s 0
          s 0
            s 2
              s 0
                s 0
                  s 0
                  x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
              s 0
                s 0
            x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
            x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
        s 0
        s 0
      s 0
        s 0
          s 0
            s 0
          x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s/^\\([0-9]\\)/v\\1/g"]]
      s 0
        s 0
          s 0
          x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s/[^\\.]//g"]]
      s 0
        x 0 ["uname", "/usr/bin/uname", ["uname", "-a"]]
      s 0
        x 3 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN {\n    if (ARGV[1] == \"\" || ARGV[2] == \"\") exit(1)\n    split(ARGV[1], a, /\\./);\n    split(ARGV[2], b, /\\./);\n    for (i=1; i<=3; i++) {\n      if (a[i] && a[i] !~ /^[0-9]+$/) exit(2);\n      if (b[i] && b[i] !~ /^[0-9]+$/) { exit(0); }\n      if (a[i] < b[i]) exit(3);\n      else if (a[i] > b[i]) exit(0);\n    }\n    exit(4)\n  }", "0.12.0", "{node}"]]
        s 0
    x 0 ["tail", "/usr/bin/tail", ["tail", "-1"]]
s 0
  s 0
  s 0
    s 0
      s 0
      s 0
      s 0
      s 0
      s 0
      s 0
        s 0
          s 0
            s 2
              s 0
                s 0
                  s 0
                  x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
              s 0
                s 0
            x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
            x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
        s 0
        s 0
      s 2
        s 0
          s 0
            s 2
              s 0
                s 0
                  s 0
                  x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
              s 0
                s 0
            x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
            x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
        s 0
        s 0
      s 0
        s 0
          s 0
            s 0
          x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s/^\\([0-9]\\)/v\\1/g"]]
      s 0
        s 0
          s 0
          x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s/[^\\.]//g"]]
      s 0
        x 0 ["uname", "/usr/bin/uname", ["uname", "-a"]]
      s 0
        x 3 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN {\n    if (ARGV[1] == \"\" || ARGV[2] == \"\") exit(1)\n    split(ARGV[1], a, /\\./);\n    split(ARGV[2], b, /\\./);\n    for (i=1; i<=3; i++) {\n      if (a[i] && a[i] !~ /^[0-9]+$/) exit(2);\n      if (b[i] && b[i] !~ /^[0-9]+$/) { exit(0); }\n      if (a[i] < b[i]) exit(3);\n      else if (a[i] > b[i]) exit(0);\n    }\n    exit(4)\n  }", "0.12.0", "{node}"]]
        s 0
    x 0 ["tail", "/usr/bin/tail", ["tail", "-1"]]
s 0
  x 0 ["uname", "/usr/bin/uname", ["uname", "-a"]]
s 0
  x 3 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN {\n    if (ARGV[1] == \"\" || ARGV[2] == \"\") exit(1)\n    split(ARGV[1], a, /\\./);\n    split(ARGV[2], b, /\\./);\n    for (i=1; i<=3; i++) {\n      if (a[i] && a[i] !~ /^[0-9]+$/) exit(2);\n      if (b[i] && b[i] !~ /^[0-9]+$/) { exit(0); }\n      if (a[i] < b[i]) exit(3);\n      else if (a[i] > b[i]) exit(0);\n    }\n    exit(4)\n  }", "0.12.0", "{node}"]]
  s 0
s 0
  x 3 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN {\n    if (ARGV[1] == \"\" || ARGV[2] == \"\") exit(1)\n    split(ARGV[1], a, /\\./);\n    split(ARGV[2], b, /\\./);\n    for (i=1; i<=3; i++) {\n      if (a[i] && a[i] !~ /^[0-9]+$/) exit(2);\n      if (b[i] && b[i] !~ /^[0-9]+$/) { exit(0); }\n      if (a[i] < b[i]) exit(3);\n      else if (a[i] > b[i]) exit(0);\n    }\n    exit(4)\n  }", "0.12.0", "{node}"]]
  s 0
s 0
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-q", "{home}/.nvm/[^/]*/bin"]]
  s 0
  s 0
    x 0 ["grep", "/usr/bin/grep", ["grep", "-q", "{home}/.nvm/versions/[^/]*/[^/]*/bin"]]
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-Eq", "(^|:)(/usr(/local)?)?/bin:.*{home}/.nvm/[^/]*/bin"]]
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-Eq", "(^|:)(/usr(/local)?)?/bin:.*{home}/.nvm/versions/[^/]*/[^/]*/bin"]]
  s 0
  x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s#{home}/.nvm/[^/]*/bin[^:]*#{home}/.nvm/versions/node/v{node}/bin#", "-e", "s#{home}/.nvm/versions/[^/]*/[^/]*/bin[^:]*#{home}/.nvm/versions/node/v{node}/bin#"]]
x 0 ["manpath", "/usr/bin/manpath", ["manpath"]]
s 0
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-q", "{home}/.nvm/[^/]*/share/man"]]
  s 0
  s 0
    x 0 ["grep", "/usr/bin/grep", ["grep", "-q", "{home}/.nvm/versions/[^/]*/[^/]*/share/man"]]
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-Eq", "(^|:)(/usr(/local)?)?/share/man:.*{home}/.nvm/[^/]*/share/man"]]
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-Eq", "(^|:)(/usr(/local)?)?/share/man:.*{home}/.nvm/versions/[^/]*/[^/]*/share/man"]]
  s 0
  x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s#{home}/.nvm/[^/]*/share/man[^:]*#{home}/.nvm/versions/node/v{node}/share/man#", "-e", "s#{home}/.nvm/versions/[^/]*/[^/]*/share/man[^:]*#{home}/.nvm/versions/node/v{node}/share/man#"]]
s 0
  x 0 ["uname", "/usr/bin/uname", ["uname", "-a"]]
x 0 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN { for (name in ENVIRON) if (toupper(name) == \"NPM_CONFIG_PREFIX\") { print name; break } }"]]
s 0
s 0
s 0
  s 0
s 0
x 0 ["gawk", "/usr/bin/gawk", ["awk", "$2 == \"on\" || $1 == \"monitor\" {print \"set -o \" $1}"]]
s 0
x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "1001,$d", "-e", "s/^alias -- /alias /", "-e", "s/^alias /alias -- /"]]
x 0 ["cat", "/usr/bin/cat", ["cat"]]
`;

/** Children of the same preamble for a user without nvm (lab run 4). */
export const CLAUDE_PREAMBLE_PLAIN = String.raw`
x 0 ["id", "/usr/bin/id", ["/usr/bin/id", "-un"]]
s 0
  x 0 ["hostnamectl", "/usr/bin/hostnamectl", ["/usr/bin/hostnamectl", "--transient"]]
x 0 ["bash", "/usr/bin/bash", ["/usr/bin/sh", "/usr/libexec/grepconf.sh", "-c"]]
  x 1 ["grep", "/usr/bin/grep", ["grep", "-qsi", "^COLOR.*none", "/etc/GREP_COLORS"]]
x 0 ["bash", "/usr/bin/bash", ["/usr/bin/sh", "/usr/libexec/grepconf.sh", "-c"]]
  x 1 ["grep", "/usr/bin/grep", ["grep", "-qsi", "^COLOR.*none", "/etc/GREP_COLORS"]]
x 0 ["bash", "/usr/bin/bash", ["/usr/bin/sh", "/usr/libexec/grepconf.sh", "-c"]]
  x 1 ["grep", "/usr/bin/grep", ["grep", "-qsi", "^COLOR.*none", "/etc/GREP_COLORS"]]
s 0
  x 1 ["cat", "/usr/bin/cat", ["cat", "/dev/null", "/etc/debuginfod/*.urls"]]
  x 0 ["tr", "/usr/bin/tr", ["tr", "\\n", " "]]
s 0
  x 0 ["locale", "/usr/bin/locale", ["/usr/bin/locale"]]
x 0 ["sed", "/usr/bin/sed", ["/usr/bin/sed", "-r", "-e", "s/^[[:blank:]]*([[:upper:]_]+)=([[:print:][:digit:]\\._-]+|\"[[:print:][:digit:]\\._-]+\")/export \\1=\\2/;t;d", "/etc/locale.conf"]]
x 0 ["cat", "/usr/bin/cat", ["cat", "/proc/{pid}/comm"]]
s 0
s 0
  s 0
s 0
x 0 ["gawk", "/usr/bin/gawk", ["awk", "$2 == \"on\" || $1 == \"monitor\" {print \"set -o \" $1}"]]
s 0
x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "1001,$d", "-e", "s/^alias -- /alias /", "-e", "s/^alias /alias -- /"]]
x 0 ["cat", "/usr/bin/cat", ["cat"]]
`;

/** Children of Cursor's `bash -O extglob -ilc` state dump for a user with nvm (lab runs 3 and 8, identical). */
export const CURSOR_STATE_DUMP_NVM = String.raw`
x 0 ["id", "/usr/bin/id", ["/usr/bin/id", "-un"]]
s 0
  x 0 ["hostnamectl", "/usr/bin/hostnamectl", ["/usr/bin/hostnamectl", "--transient"]]
x 0 ["bash", "/usr/bin/bash", ["/usr/bin/sh", "/usr/libexec/grepconf.sh", "-c"]]
  x 1 ["grep", "/usr/bin/grep", ["grep", "-qsi", "^COLOR.*none", "/etc/GREP_COLORS"]]
x 0 ["bash", "/usr/bin/bash", ["/usr/bin/sh", "/usr/libexec/grepconf.sh", "-c"]]
  x 1 ["grep", "/usr/bin/grep", ["grep", "-qsi", "^COLOR.*none", "/etc/GREP_COLORS"]]
x 0 ["bash", "/usr/bin/bash", ["/usr/bin/sh", "/usr/libexec/grepconf.sh", "-c"]]
  x 1 ["grep", "/usr/bin/grep", ["grep", "-qsi", "^COLOR.*none", "/etc/GREP_COLORS"]]
s 0
  x 1 ["cat", "/usr/bin/cat", ["cat", "/dev/null", "/etc/debuginfod/*.urls"]]
  x 0 ["tr", "/usr/bin/tr", ["tr", "\\n", " "]]
s 0
  x 0 ["locale", "/usr/bin/locale", ["/usr/bin/locale"]]
x 0 ["sed", "/usr/bin/sed", ["/usr/bin/sed", "-r", "-e", "s/^[[:blank:]]*([[:upper:]_]+)=([[:print:][:digit:]\\._-]+|\"[[:print:][:digit:]\\._-]+\")/export \\1=\\2/;t;d", "/etc/locale.conf"]]
x 0 ["cat", "/usr/bin/cat", ["cat", "/proc/{pid}/comm"]]
s 0
  s 0
    x 0 ["which", "/usr/bin/which", ["which", "node"]]
  s 0
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.local/share/cursor-agent/versions/{cursor_version}/node"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.local/share/cursor-agent/versions/{cursor_version}"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.local/share/cursor-agent/versions"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.local/share/cursor-agent"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.local/share"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.local"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "/home"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.local/share/cursor-agent/versions/{cursor_version}/node"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.local/share/cursor-agent/versions/{cursor_version}"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.local/share/cursor-agent/versions"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.local/share/cursor-agent"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.local/share"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}/.local"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "{home}"]]
  x 0 ["dirname", "/usr/bin/dirname", ["dirname", "/home"]]
s 0
  s 0
    s 0
      s 0
        x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
        x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
        s 0
          s 0
            s 0
              s 0
              x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
          s 0
            s 0
          x 0 ["sed", "/usr/bin/sed", ["sed", "s/#.*//; s/[[:space:]]*$//", "{home}/.nvm/alias/default"]]
          x 0 ["gawk", "/usr/bin/gawk", ["awk", "NF"]]
    s 0
    s 1
      x 1 ["grep", "/usr/bin/grep", ["grep", "-q", "-e", "^{node}$"]]
    s 0
      s 0
        s 2
          s 0
            s 0
              s 0
              x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
          s 0
            s 0
        x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
        x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
    s 0
    s 0
    s 0
      s 0
        s 0
      x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s/^\\([0-9]\\)/v\\1/g"]]
  s 0
  s 0
    s 0
      s 0
      s 0
      s 0
      s 0
      s 0
      s 0
        s 0
          s 0
            s 2
              s 0
                s 0
                  s 0
                  x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
              s 0
                s 0
            x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
            x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
        s 0
        s 0
      s 2
        s 0
          s 0
            s 2
              s 0
                s 0
                  s 0
                  x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
              s 0
                s 0
            x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
            x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
        s 0
        s 0
      s 0
        s 0
          s 0
            s 0
          x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s/^\\([0-9]\\)/v\\1/g"]]
      s 0
        s 0
          s 0
          x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s/[^\\.]//g"]]
      s 0
        x 0 ["uname", "/usr/bin/uname", ["uname", "-a"]]
      s 0
        x 3 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN {\n    if (ARGV[1] == \"\" || ARGV[2] == \"\") exit(1)\n    split(ARGV[1], a, /\\./);\n    split(ARGV[2], b, /\\./);\n    for (i=1; i<=3; i++) {\n      if (a[i] && a[i] !~ /^[0-9]+$/) exit(2);\n      if (b[i] && b[i] !~ /^[0-9]+$/) { exit(0); }\n      if (a[i] < b[i]) exit(3);\n      else if (a[i] > b[i]) exit(0);\n    }\n    exit(4)\n  }", "0.12.0", "{node}"]]
        s 0
    x 0 ["tail", "/usr/bin/tail", ["tail", "-1"]]
s 0
s 0
s 0
s 0
s 0
  s 0
x 0 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN {\n    if (ARGV[1] == \"\" || ARGV[2] == \"\") exit(1)\n    split(ARGV[1], a, /\\./);\n    split(ARGV[2], b, /\\./);\n    for (i=1; i<=3; i++) {\n      if (a[i] && a[i] !~ /^[0-9]+$/) exit(2);\n      if (a[i] < b[i]) exit(3);\n      else if (a[i] > b[i]) exit(0);\n    }\n    exit(0)\n  }", "{node}", "0"]]
s 0
  s 0
  x 0 ["tr", "/usr/bin/tr", ["tr", "t", "\\t"]]
s 0
  s 0
  s 0
  s 0
    s 0
      s 0
      s 0
      s 0
      s 0
      s 0
      s 0
        s 0
          s 0
            s 2
              s 0
                s 0
                  s 0
                  x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
              s 0
                s 0
            x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
            x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
        s 0
        s 0
      s 2
        s 0
          s 0
            s 2
              s 0
                s 0
                  s 0
                  x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
              s 0
                s 0
            x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
            x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
        s 0
        s 0
      s 0
        s 0
          s 0
            s 0
          x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s/^\\([0-9]\\)/v\\1/g"]]
      s 0
        s 0
          s 0
          x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s/[^\\.]//g"]]
      s 0
        x 0 ["uname", "/usr/bin/uname", ["uname", "-a"]]
      s 0
        x 3 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN {\n    if (ARGV[1] == \"\" || ARGV[2] == \"\") exit(1)\n    split(ARGV[1], a, /\\./);\n    split(ARGV[2], b, /\\./);\n    for (i=1; i<=3; i++) {\n      if (a[i] && a[i] !~ /^[0-9]+$/) exit(2);\n      if (b[i] && b[i] !~ /^[0-9]+$/) { exit(0); }\n      if (a[i] < b[i]) exit(3);\n      else if (a[i] > b[i]) exit(0);\n    }\n    exit(4)\n  }", "0.12.0", "{node}"]]
        s 0
    x 0 ["tail", "/usr/bin/tail", ["tail", "-1"]]
s 0
  s 0
  s 0
    s 0
      s 0
      s 0
      s 0
      s 0
      s 0
      s 0
        s 0
          s 0
            s 2
              s 0
                s 0
                  s 0
                  x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
              s 0
                s 0
            x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
            x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
        s 0
        s 0
      s 2
        s 0
          s 0
            s 2
              s 0
                s 0
                  s 0
                  x 0 ["tr", "/usr/bin/tr", ["tr", "[:upper:]", "[:lower:]"]]
              s 0
                s 0
            x 0 ["head", "/usr/bin/head", ["head", "-n", "1"]]
            x 0 ["tail", "/usr/bin/tail", ["tail", "-n", "1"]]
        s 0
        s 0
      s 0
        s 0
          s 0
            s 0
          x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s/^\\([0-9]\\)/v\\1/g"]]
      s 0
        s 0
          s 0
          x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s/[^\\.]//g"]]
      s 0
        x 0 ["uname", "/usr/bin/uname", ["uname", "-a"]]
      s 0
        x 3 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN {\n    if (ARGV[1] == \"\" || ARGV[2] == \"\") exit(1)\n    split(ARGV[1], a, /\\./);\n    split(ARGV[2], b, /\\./);\n    for (i=1; i<=3; i++) {\n      if (a[i] && a[i] !~ /^[0-9]+$/) exit(2);\n      if (b[i] && b[i] !~ /^[0-9]+$/) { exit(0); }\n      if (a[i] < b[i]) exit(3);\n      else if (a[i] > b[i]) exit(0);\n    }\n    exit(4)\n  }", "0.12.0", "{node}"]]
        s 0
    x 0 ["tail", "/usr/bin/tail", ["tail", "-1"]]
s 0
  x 0 ["uname", "/usr/bin/uname", ["uname", "-a"]]
s 0
  x 3 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN {\n    if (ARGV[1] == \"\" || ARGV[2] == \"\") exit(1)\n    split(ARGV[1], a, /\\./);\n    split(ARGV[2], b, /\\./);\n    for (i=1; i<=3; i++) {\n      if (a[i] && a[i] !~ /^[0-9]+$/) exit(2);\n      if (b[i] && b[i] !~ /^[0-9]+$/) { exit(0); }\n      if (a[i] < b[i]) exit(3);\n      else if (a[i] > b[i]) exit(0);\n    }\n    exit(4)\n  }", "0.12.0", "{node}"]]
  s 0
s 0
  x 3 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN {\n    if (ARGV[1] == \"\" || ARGV[2] == \"\") exit(1)\n    split(ARGV[1], a, /\\./);\n    split(ARGV[2], b, /\\./);\n    for (i=1; i<=3; i++) {\n      if (a[i] && a[i] !~ /^[0-9]+$/) exit(2);\n      if (b[i] && b[i] !~ /^[0-9]+$/) { exit(0); }\n      if (a[i] < b[i]) exit(3);\n      else if (a[i] > b[i]) exit(0);\n    }\n    exit(4)\n  }", "0.12.0", "{node}"]]
  s 0
s 0
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-q", "{home}/.nvm/[^/]*/bin"]]
  s 0
  s 0
    x 0 ["grep", "/usr/bin/grep", ["grep", "-q", "{home}/.nvm/versions/[^/]*/[^/]*/bin"]]
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-Eq", "(^|:)(/usr(/local)?)?/bin:.*{home}/.nvm/[^/]*/bin"]]
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-Eq", "(^|:)(/usr(/local)?)?/bin:.*{home}/.nvm/versions/[^/]*/[^/]*/bin"]]
  s 0
  x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s#{home}/.nvm/[^/]*/bin[^:]*#{home}/.nvm/versions/node/v{node}/bin#", "-e", "s#{home}/.nvm/versions/[^/]*/[^/]*/bin[^:]*#{home}/.nvm/versions/node/v{node}/bin#"]]
x 0 ["manpath", "/usr/bin/manpath", ["manpath"]]
s 0
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-q", "{home}/.nvm/[^/]*/share/man"]]
  s 0
  s 0
    x 0 ["grep", "/usr/bin/grep", ["grep", "-q", "{home}/.nvm/versions/[^/]*/[^/]*/share/man"]]
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-Eq", "(^|:)(/usr(/local)?)?/share/man:.*{home}/.nvm/[^/]*/share/man"]]
  s 0
  s 1
    x 1 ["grep", "/usr/bin/grep", ["grep", "-Eq", "(^|:)(/usr(/local)?)?/share/man:.*{home}/.nvm/versions/[^/]*/[^/]*/share/man"]]
  s 0
  x 0 ["sed", "/usr/bin/sed", ["sed", "-e", "s#{home}/.nvm/[^/]*/share/man[^:]*#{home}/.nvm/versions/node/v{node}/share/man#", "-e", "s#{home}/.nvm/versions/[^/]*/[^/]*/share/man[^:]*#{home}/.nvm/versions/node/v{node}/share/man#"]]
s 0
  x 0 ["uname", "/usr/bin/uname", ["uname", "-a"]]
x 0 ["gawk", "/usr/bin/gawk", ["awk", "BEGIN { for (name in ENVIRON) if (toupper(name) == \"NPM_CONFIG_PREFIX\") { print name; break } }"]]
s 0
s 0
  s 0
  x 0 ["grep", "/usr/bin/grep", ["grep", "-viE", "_proxy=|CURSOR_SANDBOX|SUDO_ASKPASS|CURSOR_ASKPASS|CURSOR_CONVERSATION_ID|CURSOR_REQUEST_ID|CURSOR_AGENT_STORE"]]
  x 0 ["grep", "/usr/bin/grep", ["grep", "-vE", "^(declare|export)( -[a-zA-Z]+)* POSIXLY_CORRECT(=|$)"]]
s 0
  s 0
  x 0 ["grep", "/usr/bin/grep", ["grep", "-vE", "^set [-+]o (errexit|monitor|nounset|pipefail|posix)$"]]
s 0
s 0
s 0
  s 0
  s 0
  x 0 ["gawk", "/usr/bin/gawk", ["awk", "-v", "sq='", "\n      !q && /^alias / { $0 = \"builtin \" $0 }\n      {\n        print\n        for (i = 1; i <= length($0); i++) {\n          c = substr($0, i, 1)\n          if (q == 1) { if (c == sq) q = 0 }\n          else if (q == 2) { if (c == \"\\\\\") i++; else if (c == sq) q = 0 }\n          else if (c == \"\\\\\") i++\n          else if (c == \"$\" && substr($0, i + 1, 1) == sq) { q = 2; i++ }\n          else if (c == sq) q = 1\n        }\n      }"]]
`;

/** Children of the fd-5 shell that ran a command in lab run 8. `command` marks where the command runs. */
export const CURSOR_COMMAND_SHELL = String.raw`
s 0
  x 0 ["cat", "/usr/bin/cat", ["cat"]]
s 0
command
s 0
  s 0
  x 0 ["grep", "/usr/bin/grep", ["grep", "-viE", "_proxy=|CURSOR_SANDBOX|SUDO_ASKPASS|CURSOR_ASKPASS|CURSOR_CONVERSATION_ID|CURSOR_REQUEST_ID|CURSOR_AGENT_STORE"]]
  x 0 ["grep", "/usr/bin/grep", ["grep", "-vE", "^(declare|export)( -[a-zA-Z]+)* POSIXLY_CORRECT(=|$)"]]
s 0
  s 0
  x 0 ["grep", "/usr/bin/grep", ["grep", "-vE", "^set [-+]o (errexit|monitor|nounset|pipefail|posix)$"]]
s 0
s 0
s 0
  s 0
  s 0
  x 0 ["gawk", "/usr/bin/gawk", ["awk", "-v", "sq='", "\n      !q && /^alias / { $0 = \"builtin \" $0 }\n      {\n        print\n        for (i = 1; i <= length($0); i++) {\n          c = substr($0, i, 1)\n          if (q == 1) { if (c == sq) q = 0 }\n          else if (q == 2) { if (c == \"\\\\\") i++; else if (c == sq) q = 0 }\n          else if (c == \"\\\\\") i++\n          else if (c == \"$\" && substr($0, i + 1, 1) == sq) { q = 2; i++ }\n          else if (c == sq) q = 1\n        }\n      }"]]
`;
