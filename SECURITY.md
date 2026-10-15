# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration stores nothing under `/data`. The motionEye password is kept
by Gladys in the integration configuration; the container holds it in memory
only, and never writes it in a log line or a message. With motionEye 0.43 or
older it never travels either: each request is signed with its SHA-1. With
motionEye 0.44 or later it is sent once to `POST /login`, in clear text over
plain HTTP: put motionEye behind HTTPS if the network between Gladys and
motionEye is not trusted. The integration only talks to the motionEye address
of the configuration, on the local network, and opens no port.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and motionEye, motion and the cameras the integration talks to.
