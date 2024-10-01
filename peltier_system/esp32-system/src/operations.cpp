#include <operations.h>

int dataArray[arraySize];  // Define the array
int index_ = 0;            // Define index
bool arrayFilled = false;  // Define the flag

bool ChangeState(bool prev_state, bool curr_state){

    if (prev_state == curr_state){
        return prev_state;
    }
    else if (prev_state != curr_state)
    {
        return curr_state;
    }
    return false;
    
}

void SerialLog(){
    Serial.println();
}


/* function to check the communication status of the RPI is false RPI might be 
offline (n/w issue or rpi is switched off or booted need to press the boot button) 
this is implemented to keep rpi cool. if rpi plugged without boot it heats up
*/
bool RpiComStatus(float sensValue) {
    Serial.println(index_);
    Serial.println(sensValue);
    dataArray[index_] = sensValue;
    index_ = (index_ + 1) % arraySize;  

    if (index == 0) {
        arrayFilled = true;
    }

    if (arrayFilled) {
        for (int i = 1; i < arraySize; i++) {
            if (dataArray[i] != dataArray[0]) {  // Compare each value with the first one
                return false;  
            }
        }
    }

    return true;  
    
}
