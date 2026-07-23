---
description: Fork this template into a new app — renames everything
argument-hint: <cli> <id> "<Display Name>"
---
Fork this clapp template into a new app by running:

```sh
scripts/rename.sh $ARGUMENTS
```

Then run `npm run verify` to confirm the forked app still builds, packages, and
round-trips over its socket. Report the new id/cli and list the leftover mentions
of the old name (they'll be in the prose docs) so the user can edit them.
