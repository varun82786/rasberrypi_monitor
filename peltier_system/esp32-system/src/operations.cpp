#include <operations.h>

bool ChangeState(bool prev_state, bool curr_state){

    if (prev_state == curr_state){
        return prev_state;
    }
    else if (prev_state != curr_state)
    {
        return curr_state;
    }
    
}

void SerialLog(){
    Serial.println();
}
