'use strict';

var crypt = require('../helpers/crypt');
const authentication = require('../helpers/authentication');


module.exports = {
    up(queryInterface, Sequelize) {

        return queryInterface.bulkInsert('users', [
            {
                username: 'admin',
                password: crypt.encryptPassword('1234', 'aaaa'),
                salt: 'aaaa',
                isAdmin: true,
                score: '0', scoreNormal: '0', scoreMultiple: '0',
                token: authentication.createToken(),
                createdAt: new Date(), updatedAt: new Date()
            },
            {
                username: 'pepe',
                password: crypt.encryptPassword('5678', 'bbbb'),
                salt: 'bbbb',
                score: 0, scoreNormal: 0, scoreMultiple: 0,
                token: authentication.createToken(),
                createdAt: new Date(), updatedAt: new Date()
            }
        ]);
    },

    down(queryInterface, Sequelize) {
        return queryInterface.bulkDelete('users', null, {});
    }
};
