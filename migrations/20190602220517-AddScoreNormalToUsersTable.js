'use strict';

module.exports = {
    up: function (queryInterface, Sequelize) {
        return queryInterface.addColumn(
            'users',
            'scorenormal',
            {
                type: Sequelize.INTEGER,
            }
        );
    },

    down: function (queryInterface, Sequelize) {
        return queryInterface.removeColumn('users', 'scorenormal');
    }
};