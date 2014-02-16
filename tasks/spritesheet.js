var fs = require( "fs" );

module.exports = function( grunt ) {
    "use strict";




    var Builder = require( '../' ).Builder;

    grunt.registerMultiTask( "spritesheet", "Compile images to sprite sheet", function() {
        var options = this.options(),
            done = this.async();

        grunt.verbose.writeflags( options, "Options" );


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
                    trimmed = 0;

                /**
                 * Runs the trim on the temp files and overwrites them, returning the left and top trimmed coordinates.
                 */
                for( var i = 0; i < copiedFiles.length; i++ ) {
                    tf = copiedFiles[ i ];

                    trimImg( i, tf, tf, function( id, left, top ) {

                        trimmedFiles.push( { id:id, left:left, top:top, src: copiedFiles[id] } );
                        trimmed++;

                        if( trimmed === copiedFiles.length ) {
                            grunt.log.ok( "trim complete" );

                            options.images = copiedFiles;

                            builder = Builder.fromGruntTask( options );
                            builder.build(function() {

                                // Always add css margins unless trim.cssMargins is defined and is set to false
                                if( options.trim.cssMargins !== false )
                                    addMarginsToCss( file.dest + "/" + options.outputCss, trimmedFiles, options.selector );

                                grunt.file.delete( "tmp" );

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

    
    // grunt.loadNpmTasks("grunt-copy-mate");
    grunt.loadTasks('../node_modules/grunt-copy-mate/tasks');




    // Trim helper methods
    var trimImg = function( id, fromPath, toPath, callback ) {
        /**
         * Trims off transparent edges from images. 
         */

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
                ,top = coordsArr[2]

            
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
            else
                copiedFiles = grunt.copy_mate.recursiveCopy( file.orig.src[i].slice( 0, asterixIndex-1 ), "tmp/" );
        };

        return copiedFiles;
    }

}; 
