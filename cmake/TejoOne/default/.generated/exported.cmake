set(DEPENDENT_MP_BIN2HEXTejoOne_default_s_leY22h "/opt/microchip/xc32/v5.10/bin/xc32-bin2hex")
set(DEPENDENT_DEPENDENT_TARGET_ELFTejoOne_default_s_leY22h ${CMAKE_CURRENT_LIST_DIR}/../../../../out/TejoOne/default.elf)
set(DEPENDENT_TARGET_DIRTejoOne_default_s_leY22h ${CMAKE_CURRENT_LIST_DIR}/../../../../out/TejoOne)
set(DEPENDENT_BYPRODUCTSTejoOne_default_s_leY22h ${DEPENDENT_TARGET_DIRTejoOne_default_s_leY22h}/${sourceFileNameTejoOne_default_s_leY22h}.c)
add_custom_command(
    OUTPUT ${DEPENDENT_TARGET_DIRTejoOne_default_s_leY22h}/${sourceFileNameTejoOne_default_s_leY22h}.c
    COMMAND ${DEPENDENT_MP_BIN2HEXTejoOne_default_s_leY22h} --image ${DEPENDENT_DEPENDENT_TARGET_ELFTejoOne_default_s_leY22h} --image-generated-c ${sourceFileNameTejoOne_default_s_leY22h}.c --image-generated-h ${sourceFileNameTejoOne_default_s_leY22h}.h --image-copy-mode ${modeTejoOne_default_s_leY22h} --image-offset ${addressTejoOne_default_s_leY22h} 
    WORKING_DIRECTORY ${DEPENDENT_TARGET_DIRTejoOne_default_s_leY22h}
    DEPENDS ${DEPENDENT_DEPENDENT_TARGET_ELFTejoOne_default_s_leY22h})
add_custom_target(
    dependent_produced_source_artifactTejoOne_default_s_leY22h 
    DEPENDS ${DEPENDENT_TARGET_DIRTejoOne_default_s_leY22h}/${sourceFileNameTejoOne_default_s_leY22h}.c
    )
