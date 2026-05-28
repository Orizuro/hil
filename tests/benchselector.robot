*** Settings ***
Library    OperatingSystem

*** Test Cases ***
Check Bench
    ${bench}=    Get Environment Variable    TEJOONE_BENCH
    Log To Console    BENCH=${bench}