import dotenv from 'dotenv';

dotenv.config();


export const config = {
    port: process.env.PORT || 3000,
    staticDir: process.env.STATIC_DIR || 'www',
    device: process.env.DEVICE_NAME,
    dbus: {
        busType: process.env.DBUS_BUS_TYPE || 'session', // 'session' or 'system'
        serviceName: process.env.DBUS_SERVICE_NAME || 'hodr.server.Control',
        servicePath: process.env.DBUS_SERVICE_PATH || '/hodr/server/Control',
        interfaceName: process.env.DBUS_INTERFACE_NAME || 'hodr.server.Control',
    },

    power: {
        ip: process.env.IP_POWER_IP,
        user: process.env.IP_POWER_USER,
        password: process.env.IP_POWER_PW
    },
    access:{
        user: process.env.USERNAME,
        password: process.env.PASSWORD,
        secret: process.env.JWT_SECRET

    },
};
    
