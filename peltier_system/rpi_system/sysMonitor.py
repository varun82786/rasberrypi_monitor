
import os
import time
import psutil

# Function to get CPU temperature
def get_cpu_temp():
    temp = os.popen("vcgencmd measure_temp").readline()
    return float(temp.replace("temp=", "").replace("'C\n", ""))

# Function to get GPU temperature (usually same as CPU temp on Raspberry Pi)
def get_gpu_temp():
    return get_cpu_temp()

# Function to get CPU usage
def get_cpu_usage():
    return psutil.cpu_percent(interval=1)

# Function to get memory usage
def get_memory_usage():
    return psutil.virtual_memory().used / (1024 * 1024 * 1024)

# Function to get disk usage
def get_disk_usage():
    return psutil.disk_usage('/').free / (1024 * 1024 * 1024)

# Function to get network I/O stats (bytes sent and received)
def get_network_io():
    net_io = psutil.net_io_counters()
    return net_io.bytes_sent, net_io.bytes_recv

# Function to get system uptime (in hours)
def get_system_uptime():
    uptime_seconds = time.time() - psutil.boot_time()
    return uptime_seconds / 3600  # Convert to hours