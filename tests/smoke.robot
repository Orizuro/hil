*** Settings ***
Documentation     Smoke test for the TejoOne firmware via MPLAB PKoB4.
...
...               Drives the on-board PKoB4 debugger through MDB. Programs the
...               target with the current default.elf and reads the PR2 Timer 2
...               period register to confirm it matches the value set by the
...               MCC configuration.
...
...               IMPORTANT: Close any active MPLAB X / VS Code debug session
...               before running this suite. Only one client can own the PKoB4
...               at a time.

Library           libraries/MdbLibrary.py
Suite Setup       Connect And Program Target
Suite Teardown    Run Keyword And Ignore Error    Quit

*** Variables ***
${DEVICE}            PIC32MZ2048EFM144
${ELF}               ${CURDIR}/../out/TejoOne/default.elf
${EXPECTED_LATJ}     ${80}
    
*** Test Cases ***
LATJ Matches MCC Configuration
    [Documentation]    After programming, the LATJ register

    ...                must equal the value set by MCC on LATJ7 (80).
    Run
    Sleep              5.05
    Halt
    ${value}=         Read Symbol    LATJ
    Should Be Equal As Integers      ${value}    ${EXPECTED_LATJ}

*** Keywords ***
Connect And Program Target
    Start Mdb
    Connect Pkob4     ${DEVICE}
    Program           ${ELF}


