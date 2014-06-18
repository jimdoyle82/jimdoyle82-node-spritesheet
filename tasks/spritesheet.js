var fs = require( "fs" );
var _ = require( "underscore" );



module.exports = function( grunt ) {
    "use strict";

    /**
     * Loads grunt-copy-mate from project node_modules instead of parent
     */
    var cwd = process.cwd();
    process.chdir(__dirname + '/..'); // jump out of tasks subdir
    grunt.loadNpmTasks('grunt-copy-mate');
    process.chdir(cwd);


    var Builder = require( '../' ).Builder;

    grunt.registerMultiTask( "spritesheet", "Compile images to sprite sheet", function() {
        var options = this.options(),
            done = this.async();

        grunt.verbose.writeflags( options, "Options" );

        if( process.platform === "win32" ) {

            if( options.outputImage )
               options.outputImage = options.outputImage.split("/").join("\\");

           if( options.output && options.output.legacy.outputImage )
               options.output.legacy.outputImage = options.output.legacy.outputImage.split("/").join("\\");

           if( options.output && options.output.retina.outputImage )
               options.output.retina.outputImage = options.output.retina.outputImage.split("/").join("\\");
        }


        var srcFiles;

        grunt.util.async.forEachSeries( this.files, function( file, callback ) {
            var builder,
                dir = '',
                files = [], f;

            srcFiles = grunt.file.expand( file.src );

            for( var i = 0; i < srcFiles.length; i++ ) {
                f = dir + srcFiles[ i ];

                if ( fs.statSync( f ).isFile() ) {
                    files.push( f );
                }
            }

            options.images = files;
            options.outputDirectory = dir + file.dest;

            // options.trim should either be true or a config object 
            if( options.trim ) {
                
                var copiedFiles = createTmp( file ),
                    tf,
                    trimmedFiles = [],
                    srcArr = [],
                    trimmed = 0;

                /**
                 * Runs the trim on the temp files and overwrites them, returning the left and top trimmed coordinates.
                 */
                for( var i = 0; i < copiedFiles.length; i++ ) {
                    tf = copiedFiles[ i ];

                    // grunt-copy-mate 0.1.3 returns an object
                    if( typeof tf === "object" ) {
                        tf = tf.destDir + tf.curDir + tf.filename;
                        // console.log( "test", tf );
                    }


                    trimImg( i, tf, tf, function( id, left, top ) {

                        var src = copiedFiles[id];
                        if( typeof src === "object" ) {
                            src = src.destDir + src.curDir + src.filename;
                        }

                        srcArr.push( src );

                        trimmedFiles.push( { id:id, left:left, top:top, src: src } );
                        trimmed++;

                        if( trimmed === copiedFiles.length ) {
                            grunt.log.ok( "trim complete" );
                            
                            options.images = srcArr;

                            builder = Builder.fromGruntTask( options );
                            builder.build(function() {

                                tidyUpCss( file.dest + "/" + options.outputCss, trimmedFiles, options.selector, !!(options.trim.safeTidyUp) );

                                // Always add css margins unless trim.cssMargins is defined and is set to false
                                if( options.trim.cssMargins !== false )
                                    addMarginsToCss( file.dest + "/" + options.outputCss, trimmedFiles, options.selector );

                                grunt.file.delete( "tmp-node-spritesheet" );

                                options.spriteCompleteCallback( trimmedFiles );
                                callback();
                            });

                        }
                    });
                }
            } else {
                // if trim is false or undefined

                builder = Builder.fromGruntTask( options );
                builder.build( callback );
            }
            
        },
        done );
    });

    


    // Trim helper methods
    var trimImg = function( id, fromPath, toPath, callback ) {
        /**
         * Trims off transparent edges from images. 
         */

        // console.log( fromPath );
        // return

        var child = grunt.util.spawn({
            cmd:"convert"
            ,args:[ fromPath, '-trim', '-identify', toPath ]
        }, function( error, result, code ) {

            // console.log( error, result, code );

            var resultArr = result.toString().split(" ")
                ,fileName = resultArr[0]
                ,imgType = resultArr[1]
                ,imgDims = resultArr[2]
                ,imgCoords = resultArr[3]
                ,coordsArr = imgCoords.split("+")
                ,left = coordsArr[1]
                ,top = coordsArr[2];

            
            // if error, probably means it has no pixels left, so delete the file
            if( error ) {
                console.log( error  );
                if( grunt.file.exists( toPath ) ) {
                    grunt.log.warn( "Deleted because no pixels: " + toPath );
                    grunt.file.delete( toPath );
                }
            }
            else {
                
                callback( id, left, top );
            }
        });
    }, // end trimImg
    tidyUpCss = function( cssSrc, trimmedFiles, selector, safeTidyUp ) {

        var css = grunt.file.read( cssSrc );

        for( var j = 0; j < trimmedFiles.length; j++ ) {

            var data = trimmedFiles[j],
                thisSrc = data.src,
                lastSlashIndex = thisSrc.lastIndexOf("/"),
                lastDotIndex = thisSrc.lastIndexOf("."),
                imgClassName = thisSrc.slice( lastSlashIndex+1, lastDotIndex ),
                classDeclLine = selector + "." + imgClassName + " {";

            grunt.log.ok( "running tidy up on: " + cssSrc, "options.trim.safeTidyUp = " + safeTidyUp );

            if( safeTidyUp ) {
                css = css.replace( classDeclLine, ( !data.top || !data.left ? "\n/*remove*/\n" : "" ) + classDeclLine );
            } else if( !data.top || !data.left ) {
                css = replaceBetween( classDeclLine, "}", css );
            }
        }

        grunt.file.write( cssSrc, css );
    },
    replaceBetween = function(rxStart, rxEnd, originalString, replacementString, keepDelimeteres ) {
        // Notes: 
        // REF: http://www.developerscloset.com/?p=548
        // 1. In this expression "\\d\\D" makes sure line breaks are included
        // 2. And "*?" means that everything will be replaced between
        // 3. "g" stands for global, which means it will look through the entire string
        // 4. If you want to escape a "/", you must make it "\/"
        // 5. If you want to escape an "*", you must make it "\\*"

        var rx = new RegExp( rxStart + "[\\d\\D]*?" + rxEnd, "g"),
            result;
        
        if( keepDelimeteres === true ) {
            result = originalString.replace( rx, rxStart + (replacementString || "") + rxEnd );
        } else {
            result = originalString.replace( rx, (replacementString || "") );
        }

        return result;
    },
    addMarginsToCss = function( cssSrc, trimmedFiles, selector ) {
        /**
         * Add margins to css file to compensate for trimmed space
         */

        var css = grunt.file.read( cssSrc );

        for( var j = 0; j < trimmedFiles.length; j++ ) {

            var data = trimmedFiles[j],
                thisSrc = data.src,
                lastSlashIndex = thisSrc.lastIndexOf("/"),
                lastDotIndex = thisSrc.lastIndexOf("."),
                imgClassName = thisSrc.slice( lastSlashIndex+1, lastDotIndex ),
                classDeclLine = selector + "." + imgClassName + " {";

            css = css.replace( classDeclLine, classDeclLine + "\n" + "  margin:" +data.top+ "px 0 0 " +data.left+"px;" );
        }

        grunt.file.write( cssSrc, css );
    },
    createTmp = function( file ) {

        var copiedFiles = [];
        /**
         * Makes a temporary copy of the images to trim.
         */
        for( var i = 0; i < file.orig.src.length; i++ ) {


            var asterixIndex = file.orig.src[i].indexOf( "*" );
            if( asterixIndex === -1 )
                grunt.log.warn( "single files not supported with 'trim' feature. 'src' must be a directory with a '*' wildcard selector." );
            else {

                // console.log( "file.orig", grunt.copy_mate );
                copiedFiles = grunt.copy_mate.recursiveCopy( file.orig.src[i].slice( 0, asterixIndex-1 ), "tmp-node-spritesheet/" );
            }
        };


        return copiedFiles;
    }

}; 
