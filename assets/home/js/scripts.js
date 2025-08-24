/*!
* Start Bootstrap - New Age v6.0.7 (https://startbootstrap.com/theme/new-age)
* Copyright 2013-2023 Start Bootstrap
* Licensed under MIT (https://github.com/StartBootstrap/startbootstrap-new-age/blob/master/LICENSE)
*/
//
// Scripts
// 

window.onload = getData;

function getData(){
    document.addEventListener("scroll", scroll);
    
    scroll();
}

window.addEventListener('DOMContentLoaded', event => {

    // Activate Bootstrap scrollspy on the main nav element
    const mainNav = document.body.querySelector('#mainNav');
    if (mainNav) {
        new bootstrap.ScrollSpy(document.body, {
            target: '#mainNav',
            offset: 74,
        });
    }

    // Collapse responsive navbar when toggler is visible
    const navbarToggler = document.body.querySelector('.navbar-toggler');
    const responsiveNavItems = [].slice.call(
        document.querySelectorAll('#navbarResponsive .nav-link')
    );
    responsiveNavItems.map(function (responsiveNavItem) {
        responsiveNavItem.addEventListener('click', () => {
            if (window.getComputedStyle(navbarToggler).display !== 'none') {
                navbarToggler.click();
            }
        });
    });
    
    $(document).keydown(function (e) {
      switch (e.which) {
        case 37: // left
              console.log("left");
          moveToSelected("prev");
          break;

        case 39: // right
          moveToSelected("next");
          break;

        default:
          return;
      }
      e.preventDefault();
    });

    $("#carousel div").click(function () {
      moveToSelected($(this));
    });

    $("#prev").click(function () {
      moveToSelected("prev");
    });

    $("#next").click(function () {
      moveToSelected("next");
    });
    
    

});

function moveToSelected(element) {
    var selected;
  if (element == "next") {
    selected = $(".selected").next();
  } else if (element == "prev") {
    selected = $(".selected").prev();
  } else {
    selected = element;
  }

  var next = $(selected).next();
  var prev = $(selected).prev();
  var prevSecond = $(prev).prev();
  var nextSecond = $(next).next();

  $(selected).removeClass().addClass("selected");

  $(prev).removeClass().addClass("prev");
  $(next).removeClass().addClass("next");

  $(nextSecond).removeClass().addClass("nextRightSecond");
  $(prevSecond).removeClass().addClass("prevLeftSecond");

  $(nextSecond).nextAll().removeClass().addClass("hideRight");
  $(prevSecond).prevAll().removeClass().addClass("hideLeft");
}

function scroll(){
    //Update arrow and gradient opacity
    document.getElementById("arrow").style.opacity =  (1 - window.scrollY / 500);
}