import { NoSleep } from './nosleep.js';

var noSleep = new NoSleep();
var btnNoSleep = document.createElement('button');


btnNoSleep.onclick = function()
{
    if (noSleep.isEnabled)
    {
        noSleep.disable();
    }

    noSleep.enable();
};

document.addEventListener('visibilitychange', function()
{
    if (document.visibilityState == "visible")
    {
            btnNoSleep.click();
    }
});

document.addEventListener('DOMContentLoaded', function() 
{
            btnNoSleep.click();   
});