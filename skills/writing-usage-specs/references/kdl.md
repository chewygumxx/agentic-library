<!--
   -
   - ~chewygumxx/agentic-library.git
   - ::: :/skills/writing-usage-specs/references/kdl.md
   -
   -->

# KDL syntax for Usage

A node has a name, positional values and `key=value` properties, and
can end with a block of child nodes in braces. Start each node on
its own line.

Quote every string value, including flag spellings, argument forms,
and help text. Write boolean values as `#true` or `#false`. Usage
reports a bare `true` or `false` as a syntax error.

```kdl
about "Read a file"
flag "--color" negate="--no-color" default=#true help="Use color"
flag "--verbose" default=#false help="Show details"
arg "<file>" help="File to read"
```

Usage supports some settings as either a property or a child node.
For example, `help "Use color"` inside the flag is equivalent to
`help="Use color"` on its declaration. Check the Usage reference for
the specific node before moving a property into a child block.

For multiline text, place `#"""` after the child node name and start
the text on the next line. Put the matching `"""#` on its own line.
The closing line's indentation is removed from each content line.
Extra indentation and literal quotes are preserved.

```kdl
about "Read a file"
flag "--color" negate="--no-color" default=#true {
    help "Use color"
    long_help #"""
        Use "color" for interactive output.
          This line keeps two leading spaces.
        """#
}
```

Use `//` to comment through the end of a line. Use `/-` immediately
before the node or property to skip. A skipped node can span several
lines, including its child block.

```kdl
about "Read a file" // Shown in help
flag "--color" help="Use color" /- hide=#true
/- flag "--draft" {
    help "Draft flag"
}
```

See the [KDL 2.0 specification](https://kdl.dev/spec/) for the full
syntax.
