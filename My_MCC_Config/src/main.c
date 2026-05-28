/*******************************************************************************
  Main Source File

  Company:
    Microchip Technology Inc.

  File Name:
    main.c

  Summary:
    This file contains the "main" function for a project.

  Description:
    This file contains the "main" function for a project.  The
    "main" function calls the "SYS_Initialize" function to initialize the state
    machines of all modules in the system
 *******************************************************************************/

// *****************************************************************************
// *****************************************************************************
// Section: Included Files
// *****************************************************************************
// *****************************************************************************

#include <stddef.h>                     // Defines NULL
#include <stdbool.h>                    // Defines true
#include <stdlib.h>                     // Defines EXIT_FAILURE
#include "definitions.h"                // SYS function prototypes


// *****************************************************************************
// *****************************************************************************
// Section: Main Entry Point
// *****************************************************************************
// *****************************************************************************

void TIMER2_EventHandler(uint32_t status, uintptr_t context)
{
    /* Toggle LED */
    LED_Toggle();

    char myData[] = "hello\r\n";

    // This API blocks until the requested bytes are transmitted out
    UART6_Write(&myData, sizeof(myData));
}

int main ( void )
{   

    SYS_Initialize(NULL);
     /* Register callback function Timer interrupt */
    TMR2_CallbackRegister(TIMER2_EventHandler,(uintptr_t)NULL);

    /* Start the timer channel 0*/
    TMR2_Start();

    while (true)
    {
    }
}


/*******************************************************************************
 End of File
*/

