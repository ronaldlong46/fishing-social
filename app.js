var express               = require("express"),
    app                   = express(),
    bodyParser            = require("body-parser"),
    mongoose              = require("mongoose"),
    passport              = require("passport"),
    flash                 = require("connect-flash"),
    LocalStrategy         = require("passport-local"),
    passportLocalMongoose = require("passport-local-mongoose"),
    methodOverride        = require("method-override"),
    Catch                 = require("./models/catch"),
    User                  = require("./models/user"),
    multer                = require("multer"),
    path                  = require("path"),
    compress_images = require('compress-images');

// Connect to MongoDB
mongoose.connect("mongodb://localhost/fishbak");

// Flash Messages
app.use(flash());

// Setup ReCaptcha Middleware
var opts =
  { secretKey: 'ADD YOUR SECRET KEY'
  , errors:
    { validation: function () { return new Error('Captcha must be filled out.') }
    , missingBody: function () { return new Error('Missing body response from recaptcha') }
    , missingError: function () { return new Error('Recaptcha not successful but no error codes provided') }
    , recaptchaErrorHandler: function (errors) {
        return new Error(errors.join(', '))
      }
    }
 }
var sentCaptcha = require('recaptcha-middleware')(opts);

// Image Compression
    function rszImg(){
        compress_images('./public/uploads/*.{jpg,JPG,jpeg,JPEG,png,svg,gif}', './public/compressed/', {compress_force: false, statistic: true, autoupdate: true}, false,
                                                    {jpg: {engine: 'mozjpeg', command: ['-quality', '60']}},
                                                    {png: {engine: 'pngquant', command: ['--quality=20-50']}},
                                                    {svg: {engine: 'svgo', command: '--multipass'}},
                                                    {gif: {engine: 'gifsicle', command: ['--colors', '64', '--use-col=web']}}, function(){
        });
    }

// Setup Express Session
app.use(require("express-session")({
    secret: "ADD YOUR SECRET KEY",
    resave: false,
    saveUninitialized: false
}));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
passport.use(new LocalStrategy(User.authenticate()));

// Schema for Posts
var locationSchema = new mongoose.Schema({
    name: String,
    gps: String,
    thumbnail: String,
    image: String,
    description: String,
    catches: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Catch"
        }
        ]
});

var Location = mongoose.model('Location', locationSchema);

// App Config
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.urlencoded({extended: true}));
app.use(methodOverride("_method"));

// Multer Setup
var storage = multer.diskStorage({
	destination: function(req, file, callback) {
		callback(null, './public/uploads')
	},
	filename: function(req, file, callback) {
		console.log(file)
		callback(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
	}
});
var upload = multer({ storage : storage}).single('image');


// Add user data globally
app.use(function(req, res, next){
   res.locals.currentUser = req.user;
   res.locals.error     = req.flash("error");
   res.locals.success   = req.flash("success");
   next();
});

// Home
app.get("/", function(req, res){
    Location.find({}, function(err, allLocations){
        if(err){
            res.send("Oops we hit a snag.");
        } else {
            res.render("locationlist", {location: allLocations});
        }
    })
});

// Location Selector
app.get("/addcatch", function(req, res){
    Location.find({}, function(err, allLocations){
        if(err){
            res.send("Oops we hit a snag.");
        } else {
            res.render("locationselector", {location: allLocations});
        }
    })
});

// Catch Feed
app.get("/catches", function(req, res){
    res.redirect("/catches/1");
});

// User Dashboard
app.get("/dashboard", isLoggedIn, function(req, res){
    res.render("dashboard")
});

// Change Email
app.get("/changeemail", isLoggedIn, function(req, res){
    res.render("changeemail");
});

// Feed Page
app.get('/catches/:page', function(req, res, next) {
    var perPage = 8
    var page = req.params.page || 1

    Catch
        .find({})
	.sort({"_id": -1})
        .skip((perPage * page) - perPage)
        .limit(perPage)
        .exec(function(err, posts) {
            Catch.count().exec(function(err, count) {
                if (err) return next(err)
                res.render('catch123', {
                    posts: posts,
                    current: page,
                    pages: Math.ceil(count / perPage)
                })
            })
        })
});

// Add location FORM
app.get("/locations/add", isLoggedIn, function(req, res){
    res.render("newlocation");
});

// Add location logic
app.post("/locations", isLoggedIn, function(req, res){
    var name = req.body.name;
    var gps = req.body.gps;
    var image = req.body.image;
    var description = req.body.description;
    var thumbnail = req.body.thumbnail;
    var addLocation = {name: name, gps: gps, image: image, description: description, thumbnail: thumbnail};
    Location.create(addLocation);
    res.redirect("/");
});

// Edit location
app.get("/locations/:id/edit", isLoggedIn, function(req, res){
    Location.findById(req.params.id, function(err, location){
        if(err){
            console.log(err);
        } else {
            res.render("editlocation", {location: location});

        }
    });
});


// Update location
app.put("/locations/:id", isLoggedIn, function(req, res){
    var name = req.body.name;
    var gps = req.body.gps;
    var thumbnail = req.body.thumbnail;
    var image = req.body.image;
    var description = req.body.description;
    var editLocation = {name: name, gps: gps, image: image, description: description, thumbnail: thumbnail};
    Location.findByIdAndUpdate(req.params.id, editLocation, function(err, msg){
        if(err){
            res.redirect("/");
        } else {
            res.redirect("/locations/" + req.params.id);
        }
    });
});

// Delete Location
app.delete("/locations/:id", function(req, res){
    Location.findByIdAndRemove(req.params.id, function(err){
        if(err){
            console.log(err);
            res.redirect("/");
        } else {
            res.redirect("/");
        }
    });
});

// Show Page
app.get("/locations/:id", function(req, res){
        //Find the location in question
    Location.findById(req.params.id).populate("catches").sort({"_id": -1}).exec(function(err, specifiedLocation){
        if(err){
            res.redirect("/");
        } else {
            //Show location to user
            res.render("location", {location: specifiedLocation});
        }
    });
});

// Location Catches
app.get("/locations/:id/catches", function(req, res){
    var perPage = 8;
    var page = req.params.page || 1;

    Catch
        .find({"catchlocationid": req.params.id})
	.sort({"_id": -1})
        .skip((perPage * page) - perPage)
        .limit(perPage)
        .exec(function(err, posts) {
            Catch.find({"catchlocationid": req.params.id}).count().exec(function(err, count) {
                if (err) return next(err)
                res.render('locationcatches', {
                    posts: posts,
                    current: page,
                    pages: Math.ceil(count / perPage)
                })
            })
        })
});

// Edit a catch
app.get("/locations/:id/catch/:catchid/edit", isUserPost, function(req, res){
   Catch.findById(req.params.catchid, function(err, foundPost){
       if(err){
           console.log(err);
           res.redirect("back");
       } else {
           res.render("editcatch", {locationID: req.params.id, post: foundPost});
       }
   });
});

// View Catch
app.get("/catch/:catchid", function(req, res){
    Catch.findById(req.params.catchid, function(err, foundPost){
        if(err){
            res.redirect("/")
        } else {
            res.render("catchpage", {post: foundPost})
        }
    });
});

// Edit Catch
app.put("/locations/:id/catch/:catchid", isUserPost, function(req, res){
    Catch.findByIdAndUpdate(req.params.catchid, req.body.post, function(err, updatedPost){
        if(err){
            console.log(err);
            res.redirect("back");
        } else {
            req.flash("success", "Your catch has been updated!");
            res.redirect("/catch/" + req.params.catchid);
        }
    });
});

// Delete Catch
app.delete("/locations/:id/catch/:catchid", isUserPost, function(req, res){
    Catch.findById(req.params.catchid, function(err, post){
        if(err){
            res.redirect("back");
        } else {
        post.remove(function(err){
            if(err){
                res.redirect("back");
            } else {
                Location.findById(req.params.id, function(err, postLoc){
                    if(err){
                        return console.log(err)
                    }
                    postLoc.catches.pull(req.params.catchid)
                    postLoc.save(function(err, editedLocation){
                        if(err){
                            return console.log(err)
                        }
                        req.flash("success", "Your catch has been deleted.");
                        res.redirect("/locations/" + editedLocation._id + "/catches/");
                    })
                })
            }
        })
        }
    });
});

// Register an account FORM
app.get("/register", function(req, res){
    res.render("register");
});

// Register Logic
app.post("/register", sentCaptcha, usernameToLowerCase, function(req, res){
    User.register(new User({username: req.body.username, email: req.body.email}), req.body.password, function(err, user){
        if(err){
            req.flash("error", err.message);
            return res.redirect("/register");
        }
        passport.authenticate("local")(req, res, function(){
            req.flash("success", "Welcome to fishingBakersfield!");
            res.redirect("/");
        });
    });
});


// Admin Panel
app.get("/admin", function(req, res){
  User.find({}, function(err, users){
      if(err){
          console.log(err);
      } else {
          res.render("admin", {users: users});
      }
  });
});

// Terms
app.get("/terms", function(req, res){
	res.render("terms");
});

// Login FORM ONLY
app.get("/login", function(req, res){
    res.render("login");
});

// Login Logic (NOT FORM)
app.post("/login", usernameToLowerCase, passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
    failureFlash: true
    }),
    function(req, res){
 });

 // Logout
 app.get("/logout", function(req, res){
     req.logout();
     req.flash("success", "You've been logged out. Come back soon!");
     res.redirect("back");
 });

// New Catch FORM ONLY
app.get("/locations/:id/catch/new", isLoggedIn, function(req, res){
    Location.findById(req.params.id, function(err, location){
        if(err){
            console.log(err);
        } else {
            res.render("newcatch", {location: location});
        }
    });
});

// Catch Post LOGIC
app.post("/locations/:id/catch", isLoggedIn, function(req, res){
    Location.findById(req.params.id, function(err, location){
        if(err){
            console.log(err);
            res.redirect("/locations");
        } else {
            upload(req, res, function(err){
                if(err){
                    return res.end("Upload unsuccessful");
                }
        var catchlocation = req.body.catchlocation;
        var catchlocationid = req.body.catchlocationid;
        var species = req.body.species;
        var image = '/compressed/' + req.file.filename;
        var weight = req.body.weight;
        var description = req.body.description;
        var addCatch = {species: species, image: image, weight: weight, description: description, catchlocation: catchlocation, catchlocationid: catchlocationid};

        Catch.create(addCatch, function(err, post){
            if(err){
                res.redirect("locations/:id/catch/new");
            } else {
		        rszImg(req.file.path);
                post.author.id = req.user._id;
                post.author.username = req.user.username;
                post.save();
                location.catches.push(post);
                location.save();
                req.flash('success', '<meta http-equiv="refresh" content="2" > Your catch has been added. Thank you!');
                res.redirect("/locations/" + location._id + "/catches/");
            }
        });
            });
        }
    });
});

// Resources
app.get("/resources", function(req, res){
	res.render("resources");
});

// Not found page - KEEP LAST
app.get("*", function(req, res){
    res.render("notfound");
});

function isLoggedIn(req, res, next){
    if(req.isAuthenticated()){
        return next();
    }
    req.flash("error", "You must be logged in to do that.");
    res.redirect("/login");
}

function usernameToLowerCase(req, res, next){
            req.body.username = req.body.username.toLowerCase();
            next();
}


function isUserPost(req, res, next){
    if(req.isAuthenticated()){
       Catch.findById(req.params.catchid, function(err, foundPost){
           if(err){
               res.redirect("back");
           } else {
               if(foundPost.author.id.equals(req.user._id) || req.user.isAdmin){
                   next();
               } else {
                   req.flash("error", "You can't edit other angler's catches.");
                   res.redirect("back");
               }
           }
       });
    } else {
        res.redirect("back");
    }
}

app.set('port',  (process.env.PORT || 5000));

app.listen(5000, function(){
   console.log("fishingBakersfield is now live!");
});
