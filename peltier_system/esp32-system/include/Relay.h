#ifndef RELAY_H
#define RELAY_H

class Relay {
private:
    unsigned char pin;

public:
    // Constructor
    Relay(unsigned char relayPin);

    // Methods to control the relay
    void init();
    void on();
    void off();
};

#endif
