# dev-compose

dev-compose is a command-line tool for managing portable development environments using Docker.
It's built on top of [docker-compose](https://docs.docker.com/compose/).


### Installation

1. Download the version of the tool built for your OS.
2. Unzip it
3. Place the executable file somewhere within your system path (so your shell or command interpreter
 can find it). For example:
* Mac or Linux: `/usr/local/bin`
* Windows 10: `C:\Windows\System32`

### Requirements

dev-compose requires Docker to be running, and for the docker-compose binary to be present in your
execution path.

### Usage

dev-compose is configured using a devSpec. This is a YAML file, usually named `dev.yml` and located
 in the top-level directory of your software project. It defines the containers that are required,
 and the commands to run within them to accomplish tasks such as recompiling the application or
 bringing up a new instance from scratch on your local machine.

dev-compose is invoked by the command `dev`. By default it looks for a `dev.yml` file in the current
working directory and parses it.

To see what commands are available:
```
dev commands
```

To run a single command:
```
dev <command> [args...]
```

To start an interactive shell:
```
dev
```

#### Commands

You can define custom commands specific to your project by adding handlers to your `dev.yml` file.
In addition, these built-in commands are always available:

* `status` - Show the status (running/stopped) of the containers defined in your devSpec
* `start` - Start the containers defined in your devSpec (creating them first, if necessary).
   You can specify `start <service_name>` to start a specific container only.
* `stop` - Stop the containers defined in your devSpec
   You can specify `stop <service_name>` to stop a specific container only.
* `restart` - Restart the containers defined in your devSpec.
   You can specify `restart <service_name>` to restart a specific container only.
* `init` - (Re-)initialise the dev environment. Ideally, this is the only command a developer needs
  to type to get a fully working development version of your application up and running.
  `init` performs the following sequence of actions:
  1. If containers already exist for this project, stop and remove them.
  1. Pull the latest versions of any referenced Docker images.
  1. Create and start the containers defined in your devSpec.
  1. If an `init` handler is defined in your devSpec, run its actions. This might perform tasks
     like installing dependencies, and creating database tables.
* `destroy` - Stop and remove any containers that exist for this project. If a `destroy` handler
  is defined in your devSpec, its actions run first.
* `sync` - Bring the dev environment up to date. Ideally, this is the only command a developer
  needs to type after pulling changes to the source code, to get their instance of the application
   working again. `sync` performs the following sequence of actions:
  1. Pull the latest versions of any referenced Docker images. Re-create containers, if necessary,
     to use the new images.
  1. Rebuild any auto-built container images
  1. If a `sync` handler is defined in your devSpec, run its actions. This might perform tasks
     like installing new dependencies, and modifying the schema of a database.
* `exec` - Execute a program inside a container. The syntax is
   `exec [-c <service_name>] <program> [args...]`.
   The program can be followed by space-separated arguments. _Note:_ Shell syntax and argument
   escaping are not currently supported. If you don't specify a service name, the default container
   will be used. Interactive commands are supported (so `exec bash` could launch a shell
   inside your container, for example).
* `logs` - Print the recent log output from a container, then follow and continue to print any new
   log messages that arrive until Ctrl-C is pressed. The syntax is
   `logs [-c <service_name>]`. If you don't specify a service name, the default container will be used.
* `commands` - Lists the commands that are applicable to the current devSpec, including any custom commands.


* * *

### Why use Docker containers in development?
Containerised dev environments are a great way of making sure everyone in your development team
has access to the correct build, test and runtime dependencies. This is especially true when developing
web applications, where there is an overwhelming choice of build systems, package managers and
frameworks. These applications can also be complicated to configure and bring up. When onboarding a
new developer, significant time can be spent just trying to get an instance of the product running
on their machine.

Using container images and scripts, the process for preparing and running the application on a
developer's laptop can be fully automated.
 
The general approach is:

1. Check out the project source code as normal in the host OS
2. Create the container and mount your source code directory into it
3. Modify the code in the host OS, but execute all build tools (and the application itself) inside
   the container

Each developer can use their IDE of choice on their platform of choice (Mac/Win/Linux) without
taking any special steps to set up their machine for building and running each application they work
on. The only tool they need to install is Docker.


### Why not just use docker-compose?

docker-compose, distributed with Docker, is a convenient way of starting a set
of containers needed for development (such as an app container and a database). You define the
containers in a `docker-compose.yml` file (which can be committed with your project) and then type
`docker-compose up` to start them all.

But there are a few minor annoyances when using docker-compose for development, which this tool aims
to address:

1. In development you may need to run some commands frequently inside your running containers. Sometimes you
   even need to run a sequence of commands across multiple containers (execute a build in container
   A, then a restart in container B). docker-compose just starts the containers, it doesn't help
   you script these operations. If you script them yourself (eg. a bash script that calls docker-compose)
   you break the platform independence that the containerised dev environment promised.
1. Running commands in a container is verbose (you get pretty sick of typing `docker-compose exec
   container_name`)
1. You can't configure different default environment variables or run-as-user for command-line
   actions. The configuration used to start the main container process will be applied to all
   command-line actions, unless you specify overrides every time you call `docker-compose exec`.
1. If you also use docker-compose in production, you may want `docker-compose.yml` to contain
   your deployment configuration, which is probably quite different to your development configuration.
   If you see a `docker-compose.yml` file in a project, you can't easily tell if it's meant for
   development or deployment purposes.
1. It would be nice if docker-compose could automatically load environment variable overrides from
   a `local.env` file if it happens to be present in your working copy, without _requiring_ that it be
   present (so you can exclude it from source control).


* * *

### devSpec reference

dev-compose is configured using a YAML file, usually named `dev.yml`, which is intended to live in
 the top-level directory of your software project and be committed with the project. Its syntax is
 a superset of `docker-compose.yml`. You can define `services`, `networks` and `volumes`
 [as you normally would](https://docs.docker.com/compose/compose-file/), plus these top-level keys:

* `handlers`: Define named command sequences
* `command_defaults`: Override the settings used when executing a command in a running container
   (either ad-hoc on the command line, or via a handler)
* `buildkit`: A flag specifying whether to enable the next-gen Docker image builder. Relevant only if
   some of your service definitions include a `build` section.

#### handlers
```yaml
# This example defines a handler called 'init', containing a sequence of 3 actions
handlers:
  init:
    - service: app
      command: npm install
    - service: app
      command: gulp
    - service: db
      command: migrate-schema
```
Each named handler consists of an array of actions. Each action can contain the following keys:
* `service` - Specifies which container this action applies to. A default can be set under
  `command_defaults`. Otherwise it defaults to the first one defined in the `services` section.
* `action` - The name of a special action to perform. Currently the only supported value is `restart`,
   which restarts the container.
* `command` - A program to execute inside the container. This can include space-separated arguments,
 or you can specify the arguments separately with `args`. _Note:_ Shell syntax and escaping rules do not work here.
* `handler` - The name of another handler to execute. Allows you to include all the actions of one
  handler within another.
* `args` - An array of command-line arguments. If used with `handler`, these arguments will be
  _appended_ to each command that handler executes.
* `user` - The username or UID (inside the container) to use when executing the command.
* `working_dir` - The path (inside the container) to set as the working directory when executing the command.
* `environment` - Key-value pairs to append to the program's environment.

Each action must specify exactly one of `action`, `command` or `handler`.

All the other keys are optional. Defaults are inherited in this order of priority:
1. From the `command_defaults` section
1. From the services section
1. From the container image

#### command_defaults
The command_defaults section can contain the following keys:
* `service` - Specifies the default container that commands should run within.
* `user` - The default username or UID (inside the container) to use when executing a command.
* `working_dir` - The default path (inside the container) to set as the working directory when
   executing a command.
* `environment` - Key-value pairs to append to the program's environment when executing a command.

#### buildkit
This is a boolean value. When true, it's equivalent to running the Docker CLI with the
 `DOCKER_BUILDKIT` environment variable set, so it will
  [use BuildKit to build Docker images](https://docs.docker.com/develop/develop-images/build_enhancements/).
  When absent, *this property is true by default*, since BuildKit provides some features
  that are super useful in development scenarios.


* * *

### Example

```yaml
# This example is for a Node.JS server project. The Gulp build system is in use.
# Build actions are performed in a 'build' container, which is kept running by setting its
# initial command to 'bash'. The built daemon runs in the 'app' container.

version: '3.6'

services:
  build:
    image: node:12-buster
    restart: on-failure
    volumes:
      - ./:/srv/app:cached
    working_dir: /srv/app
    command: bash
    tty: true
    ports:
      - "9230:9230"
    env_file:
      - dev.env
    environment:
      PATH: "$PATH:/srv/app/bin:/srv/app/node_modules/.bin"

  app:
    image: node:12-buster
    restart: no
    volumes:
      - ./:/srv/app:cached
    working_dir: /srv/app
    command: node --inspect=0.0.0.0:9229 bin/server
    ports:
      - "8080:8080"
      - "9229:9229"
    env_file:
      - dev.env

  db:
    image: mysql:5.6
    restart: on-failure
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
    ports:
      - "127.0.0.1:33060:3306"
    environment:
      MYSQL_DATABASE: app
      MYSQL_PASSWORD: devdb
      MYSQL_ROOT_PASSWORD: devdb
      MYSQL_USER: app

handlers:
  build:
    - command: gulp
    - service: app
      action: restart
  sync:
    - command: npm install
    - handler: build
    - handler: migrate
  init:
    - command: rm -Rf node_modules
    - command: npm install
    - handler: build
      args:
        - clean
    - handler: build
    - handler: migrate
    - command: cli setup
  cli:
    - command: node --inspect=0.0.0.0:9230 bin/cli
  sql:
    - command: cli orm generate
  migrate:
    - command: cli orm migrate
```
