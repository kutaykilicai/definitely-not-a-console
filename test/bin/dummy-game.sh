#!/bin/sh
# Dummy "game" for the launch/return test: runs for $1 seconds.
echo "dummy game started $$ args: $*" >> /tmp/ps5menu-dummy.log
sleep "${1:-3}"
echo "dummy game exit $$" >> /tmp/ps5menu-dummy.log
