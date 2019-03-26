const Sequelize = require("sequelize");
const Op = Sequelize.Op;
const {models} = require("../models");
const cloudinary = require('cloudinary');
const fs = require('fs');
const attHelper = require("../helpers/attachments");

const multer  = require('multer');

const paginate = require('../helpers/paginate').paginate;

// Options for the files uploaded to Cloudinary
const cloudinary_upload_options = {
    async: false,
    folder: "/core/quiz2018/attachments",
    resource_type: "auto",
    tags: ['core', 'quiz']
};


// Autoload el quiz asociado a :quizId
exports.load = (req, res, next, quizId) => {

    models.quiz.findByPk(quizId, {
        include: [
            models.tip,
            models.attachment,
            {model: models.user, as: 'author'}
        ]
    })
    .then(quiz => {
        if (quiz) {
            req.quiz = quiz;
            next();
        } else {
            throw new Error('There is no quiz with id=' + quizId);
        }
    })
    .catch(error => next(error));
};


// MW that allows actions only if the user logged in is admin or is the author of the quiz.
exports.adminOrAuthorRequired = (req, res, next) => {

    const isAdmin  = !!req.session.user.isAdmin;
    const isAuthor = req.quiz.authorId === req.session.user.id;

    if (isAdmin || isAuthor) {
        next();
    } else {
        console.log('Prohibited operation: The logged in user is not the author of the quiz, nor an administrator.');
        res.send(403);
    }
};


// GET /quizzes
exports.index = (req, res, next) => {

    let countOptions = {
        where: {}
    };

    let title = "Questions";

    // Search:
    const search = req.query.search || '';
    if (search) {
        const search_like = "%" + search.replace(/ +/g,"%") + "%";

        countOptions.where = {question: { [Op.like]: search_like }};
    }

    // If there exists "req.user", then only the quizzes of that user are shown
    if (req.user) {
        countOptions.where.authorId = req.user.id;
        title = "Questions of " + req.user.username;
    }

    models.quiz.count(countOptions)
    .then(count => {

        // Pagination:

        const items_per_page = 10;

        // The page to show is given in the query
        const pageno = parseInt(req.query.pageno) || 1;

        // Create a String with the HTMl used to render the pagination buttons.
        // This String is added to a local variable of res, which is used into the application layout file.
        res.locals.paginate_control = paginate(count, items_per_page, pageno, req.url);

        const findOptions = {
            ...countOptions,
            offset: items_per_page * (pageno - 1),
            limit: items_per_page,
            include: [
                models.attachment,
                {model: models.user, as: 'author'}
            ]
        };

        return models.quiz.findAll(findOptions);
    })
    .then(quizzes => {
        res.render('quizzes/index.ejs', {
            quizzes,
            search,
            cloudinary,
            title
        });
    })
    .catch(error => next(error));
};


// GET /quizzes/:quizId
exports.show = (req, res, next) => {

    const {quiz} = req;

    res.render('quizzes/show', {
        quiz,
        cloudinary
    });
};


// GET /quizzes/new
exports.new = (req, res, next) => {

    const quiz = {
        question: "",
        answer: ""
    };

    res.render('quizzes/new', {quiz});
};

// POST /quizzes/create
exports.create = (req, res, next) => {

    const upload = multer({dest: './uploads/', limits: {fileSize: 2 * 1024 * 1024}}).single('image');

    new Sequelize.Promise((resolve, reject) => {

        // loads fields from multipart form.
        upload(req, res, error => {

            if (error instanceof multer.MulterError) {
                // A Multer error occurred when uploading.
                req.flash('error', 'Failure uploading attachment file to the server: ' + error.message);
                reject(error);
            } else if (error) {
                // An unknown error occurred when uploading.
                reject(error);
            } else {
                // Everything went fine.
                resolve();
            }
        })
    })
    .then(() => {

        const {question, answer} = req.body;

        const authorId = req.session.user && req.session.user.id || 0;

        const quiz = models.quiz.build({
            question,
            answer,
            authorId
        });

        // Saves only the fields question and answer into the DDBB
        return quiz.save({fields: ["question", "answer", "authorId"]});
    })
    .then(quiz => {
        req.flash('success', 'Quiz created successfully.');

        if (!req.file) {
            req.flash('info', 'Quiz without attachment.');
            res.redirect('/quizzes/' + quiz.id);
            return;
        }

        // Save the attachment into  Cloudinary
        return attHelper.checksCloudinaryEnv()
        .then(() => {
            return attHelper.uploadResourceToCloudinary(req.file.path, cloudinary_upload_options);
        })
        .then(uploadResult => {

            // Create the new attachment into the data base.
            return models.attachment.create({
                public_id: uploadResult.public_id,
                url: uploadResult.url,
                filename: req.file.originalname,
                mime: req.file.mimetype,
                quizId: quiz.id })
            .then(attachment => {
                req.flash('success', 'Image saved successfully.');
            })
            .catch(error => { // Ignoring validation errors
                req.flash('error', 'Failed to save file: ' + error.message);
                cloudinary.api.delete_resources(uploadResult.public_id);
            });

        })
        .catch(error => {
            req.flash('error', 'Failed to save attachment: ' + error.message);
        })
        .then(() => {
            fs.unlink(req.file.path, err => {
                if (err) {
                    console.log(`Error deleting file: ${req.file.path} >> ${err}`);
                }
            }); // delete the file uploaded at./uploads
            res.redirect('/quizzes/' + quiz.id);
        });
    })
    .catch(Sequelize.ValidationError, error => {
        req.flash('error', 'There are errors in the form:');
        error.errors.forEach(({message}) => req.flash('error', message));
        res.render('quizzes/new', {quiz});
    })
    .catch(error => {
        req.flash('error', 'Error creating a new Quiz: ' + error.message);
        next(error);
    });
};


// GET /quizzes/:quizId/edit
exports.edit = (req, res, next) => {

    const {quiz} = req;

    res.render('quizzes/edit', {quiz});
};


// PUT /quizzes/:quizId
exports.update = (req, res, next) => {

    const upload = multer({dest: './uploads/', limits: {fileSize: 2 * 1024 * 1024}}).single('image');

    new Sequelize.Promise((resolve, reject) => {

        // loads fields from multipart form.
        upload(req, res, error => {

            if (error instanceof multer.MulterError) {
                // A Multer error occurred when uploading.
                req.flash('error', 'Failure uploading attachment file to the server: ' + error.message);
                reject(error);
            } else if (error) {
                // An unknown error occurred when uploading.
                reject(error);
            } else {
                // Everything went fine.
                resolve();
            }
        })
    })
    .then(() => {

        const {quiz, body} = req;

        quiz.question = body.question;
        quiz.answer = body.answer;

        return quiz.save({fields: ["question", "answer"]});
    })
    .then(quiz => {
        req.flash('success', 'Quiz edited successfully.');

        if (!req.body.keepAttachment) {

            // There is no attachment: Delete old attachment.
            if (!req.file) {
                req.flash('info', 'This quiz has no attachment.');
                if (quiz.attachment) {
                    cloudinary.api.delete_resources(quiz.attachment.public_id);
                    quiz.attachment.destroy();
                }
                return;
            }

            // Save the new attachment into Cloudinary:
            return attHelper.checksCloudinaryEnv()
            .then(() => {
                return attHelper.uploadResourceToCloudinary(req.file.path, cloudinary_upload_options);
            })
            .then(function (uploadResult) {

                // Remenber the public_id of the old image.
                const old_public_id = quiz.attachment ? quiz.attachment.public_id : null;

                // Update the attachment into the data base.
                return quiz.getAttachment()
                .then(function(attachment) {
                    if (!attachment) {
                        attachment = models.attachment.build({ quizId: quiz.id });
                    }
                    attachment.public_id = uploadResult.public_id;
                    attachment.url = uploadResult.url;
                    attachment.filename = req.file.originalname;
                    attachment.mime = req.file.mimetype;
                    return attachment.save();
                })
                .then(function(attachment) {
                    req.flash('success', 'Image saved successfully.');
                    if (old_public_id) {
                        cloudinary.api.delete_resources(old_public_id);
                    }
                })
                .catch(function(error) { // Ignoring image validation errors
                    req.flash('error', 'Failed saving new image: '+error.message);
                    cloudinary.api.delete_resources(uploadResult.public_id);
                });


            })
            .catch(function(error) {
                req.flash('error', 'Failed saving the new attachment: ' + error.message);
            })
            .then(function () {
                fs.unlink(req.file.path, err => {
                    if (err) {
                        console.log(`Error deleting file: ${req.file.path} >> ${err}`);
                    }
                }); // delete the file uploaded at./uploads
            });
        }
    })
    .then(function () {
        res.redirect('/quizzes/' + req.quiz.id);
    })
    .catch(Sequelize.ValidationError, error => {
        req.flash('error', 'There are errors in the form:');
        error.errors.forEach(({message}) => req.flash('error', message));
        res.render('quizzes/edit', {quiz});
    })
    .catch(error => {
        req.flash('error', 'Error editing the Quiz: ' + error.message);
        next(error);
    });
};


// DELETE /quizzes/:quizId
exports.destroy = (req, res, next) => {

    // Delete the attachment at Cloudinary (result is ignored)
    if (req.quiz.attachment) {
        attHelper.checksCloudinaryEnv()
        .then(() => {
            cloudinary.api.delete_resources(req.quiz.attachment.public_id);
        });
    }

    req.quiz.destroy()
    .then(() => {
        req.flash('success', 'Quiz deleted successfully.');
        res.redirect('/goback');
    })
    .catch(error => {
        req.flash('error', 'Error deleting the Quiz: ' + error.message);
        next(error);
    });
};


// GET /quizzes/:quizId/play
exports.play = (req, res, next) => {

    const {quiz, query} = req;

    const answer = query.answer || '';

    res.render('quizzes/play', {
        quiz,
        answer,
        cloudinary
    });
};


// GET /quizzes/:quizId/check
exports.check = (req, res, next) => {

    const {quiz, query} = req;

    const answer = query.answer || "";
    const result = answer.toLowerCase().trim() === quiz.answer.toLowerCase().trim();

    res.render('quizzes/result', {
        quiz,
        result,
        answer
    });
};
