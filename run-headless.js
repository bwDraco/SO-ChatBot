var Nightmare = require('nightmare'),
	readline = require('readline');

var hound = new Nightmare({
	cookiesFile: 'cookies.jar',
	webSecurity: false
});

var config = require('./run-headless.config.json');

function once (fn) {
	var called = false, res;
	return function () {
		if (called) { return res; }

		called = true;
		res = fn.apply(this, arguments);

		return res;
	};
}

hound.drainQueue = function (cb) {
	var self = hound;

	setTimeout(next, 0);
	function next(err) {
		var item = self.queue.shift();
		if (!item) {
			cb && cb(err, self);
			return;
		}

		var method = item[0],
			args = item[1];
		args.push(once(next));
		method.apply(self, args);
	}
};

function seLogin () {
	hound
		.evaluate(function(email, password) {
			document.querySelector('#login-form input[type="email"]').value = email;
			document.querySelector('#login-form input[type="password"]').value = password;
		}, function() {}, config.email, config.password)
		.screenshot('pics/mid-login.png')
		.click('#login-form input[type="button"]')
		.wait(10000) // wait for stackauth universal login to complete
		.screenshot('pics/post-login.png');
}
function injectToChat (hound) {
	hound
		.goto(config.roomUrl)
		.wait()
		.screenshot('pics/chat.png')
		.evaluate(function () {
			var script = document.createElement('script');
			script.src = 'http://localhost/master.js';
			script.onload = function() {
				//bot.activateDevMode();
				console.log('Loaded bot');
				bot.adapter.out.add('I have just been restarted! This happens daily automatically, or when my owner restarts me. Ready for commands.');
			};
			document.head.appendChild(script);
		}, function () {
			console.log('Injected chatbot.');
		});
}

hound
	.goto(config.siteUrl + '/users/login/')
	.screenshot('pics/pre-login.png')
	.wait(5000)
	.url(function (url) {
		if (!/login-add/.test(url)) {
			console.log('Need to authenticate');
			hound.use(seLogin);
		}
		else {
			console.log('Cool, already logged in');
		}

		hound.use(injectToChat);
		hound.drainQueue(function () {
			console.log('Should be done loading stuff.');
			hitTheRepl();
		});
	})
	.setup(function () {
		hound.drainQueue();
	});

function hitTheRepl() {
	var repl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	console.log('You are now in a REPL with the remote page. Have fun!');

	hound.on('consoleMessage', function (msg) {
		console.log('<', msg);
	});
	hound.on('error', function (msg) {
		console.log('! ', msg);
	});

	repl.on('line', function (data) {
		hound.evaluate(function (code) {
			try {
				return eval(code);
			}
			catch (e) {
				return e.message;
			}
		}, function (res) {
			console.log('$', res);
			repl.prompt();
		}, data).drainQueue();
	});
	repl.on('close', function () {
		console.log('Leaving the nightmare...');
		hound.teardownInstance();
	});

	repl.prompt();
}

