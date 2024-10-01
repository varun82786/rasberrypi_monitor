#ifndef OPERATIONS_H
#define OPERATIONS_H

#include <ArduinoJson.h>


const int arraySize = 10;  // Length of the array
extern int dataArray[arraySize];  // Declare the array with extern
extern int index_;               // Declare index with extern
extern bool arrayFilled;         // Declare the flag with extern

// Functions for all the operatoins
bool ChangeState(bool prev_state, bool curr_state);
bool RpiComStatus(float sensValue);


#endif
