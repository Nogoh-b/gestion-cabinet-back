@echo off
set PORT=3005
call "C:\Program Files\nodejs\npm.cmd" run start:dev 1>tmp\onboarding-api.stdout.log 2>tmp\onboarding-api.stderr.log
