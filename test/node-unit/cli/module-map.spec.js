'use strict';

const {castArray} = require('../../../lib/utils');
const rewiremock = require('rewiremock/node');
const sinon = require('sinon');
const path = require('path');

const CWD = path.join(__dirname, '..', '..', '..');

describe('module-map', function() {
  afterEach(function() {
    sinon.restore();
  });

  describe('class ModuleMap', function() {
    let stubs;
    let mocks;
    /**
     * @type {import('../../../lib/cli/module-map').ModuleMap}
     */
    let moduleMap;
    /**
     * @type {typeof import('../../../lib/cli/module-map').ModuleMap}
     */
    let ModuleMap;

    beforeEach(function() {
      const ModuleMapNode = sinon.spy(
        (filename, {children = [], parents = [], entryFiles = []} = {}) =>
          Object.create({
            toJSON() {
              return {
                filename: this.filename,
                children: [...this.children],
                parents: [...this.parents],
                entryFiles: [...this.entryFiles]
              };
            },
            filename,
            children: new Set(castArray(children)),
            parents: new Set(castArray(parents)),
            entryFiles: new Set(castArray(entryFiles))
          })
      );
      ModuleMapNode.create = ModuleMapNode;

      mocks = {
        FileEntryCache: {
          destroy: sinon.stub(),
          getUpdatedFiles: sinon.stub(),
          reconcile: sinon.stub(),
          hasFileChanged: sinon.stub().returns(true),
          normalizeEntries: sinon.stub().returns([]),
          removeEntry: sinon.stub()
        },
        ModuleMapCache: {
          all: sinon.stub().returns({}),
          save: sinon.stub(),
          destroy: sinon.stub(),
          setKey: sinon.stub()
        },
        ModuleMapNode
      };

      stubs = {
        'find-cache-dir': sinon.stub().returns(''),
        'file-entry-cache': {
          create: sinon.stub().returns({...mocks.FileEntryCache})
        },
        'flat-cache': {
          create: sinon.stub().returns({...mocks.ModuleMapCache})
        },
        resolver: {
          resolveDependencies: sinon.stub().returns(new Set())
        },
        'module-map-node': {
          ModuleMapNode: mocks.ModuleMapNode
        }
      };
      const moduleMapModule = rewiremock.proxy(
        () => require('../../../lib/cli/module-map'),
        r => ({
          'file-entry-cache': r
            .with(stubs['file-entry-cache'])
            .directChildOnly(),
          'flat-cache': r.with(stubs['flat-cache']).directChildOnly(),
          precinct: r.with(stubs.precinct).directChildOnly(),
          'find-cache-dir': r
            .by(() => stubs['find-cache-dir'])
            .directChildOnly(),
          [require.resolve('../../../lib/cli/resolver')]: r
            .with(stubs.resolver)
            .directChildOnly(),
          [require.resolve('../../../lib/cli/module-map-node')]: r
            .with(stubs['module-map-node'])
            .directChildOnly()
        })
      );
      ModuleMap = moduleMapModule.ModuleMap;
      stubs.cwd = sinon.stub(ModuleMap.prototype, 'cwd').get(() => CWD);
    });

    describe('constructor', function() {
      beforeEach(function() {
        sinon.stub(ModuleMap.prototype, '_init').returnsThis();
        sinon
          .stub(ModuleMap.prototype, 'createModuleMapCache')
          .returns({...mocks.ModuleMapCache});
        sinon
          .stub(ModuleMap.prototype, 'createFileEntryCache')
          .returns({...mocks.FileEntryCache});

        moduleMap = new ModuleMap({
          entryFiles: ['/some/file.js']
        });
      });

      it('should initialize', function() {
        expect(moduleMap._init, 'was called once');
      });

      it('should create/load a module map cache', function() {
        expect(moduleMap.createModuleMapCache, 'was called once');
      });

      it('should create/load a file entry cache', function() {
        expect(moduleMap.createFileEntryCache, 'was called once');
      });
    });

    describe('instance method', function() {
      /**
       * @type {import('../../../lib/cli/module-map').ModuleMap}
       */
      let moduleMap;

      beforeEach(function() {
        sinon.stub(ModuleMap.prototype, '_init').returnsThis();
        sinon
          .stub(ModuleMap.prototype, 'createModuleMapCache')
          .returns({...mocks.ModuleMapCache});
        sinon
          .stub(ModuleMap.prototype, 'createFileEntryCache')
          .returns({...mocks.FileEntryCache});

        moduleMap = ModuleMap.create({
          entryFiles: ['/some/file.js', '/some/other/file.js']
        });

        moduleMap._init.restore();
        moduleMap.createFileEntryCache.restore();
        moduleMap.createModuleMapCache.restore();
      });

      describe('_init()', function() {
        beforeEach(function() {
          sinon.stub(moduleMap, 'getChangedFiles').returns([]);
          sinon.stub(moduleMap, '_populate').returnsThis();
          sinon.stub(moduleMap, 'persistModuleMapCache').returnsThis();
          sinon.stub(moduleMap, 'persistFileEntryCache').returnsThis();
          sinon.stub(moduleMap, 'mergeFromCache').returnsThis();
          sinon.stub(moduleMap, 'resetModuleMapCache').returnsThis();
          sinon.stub(moduleMap, 'resetFileEntryCache').returnsThis();
          moduleMap._initialized = false;
        });

        describe('when already initialized', function() {
          beforeEach(function() {
            moduleMap._initialized = true;
          });

          it('should throw', function() {
            expect(() => moduleMap._init(), 'to throw');
          });
        });

        it('should return its context', function() {
          expect(moduleMap._init(), 'to be', moduleMap);
        });

        describe('when entry files have changed', function() {
          beforeEach(function() {
            moduleMap.getChangedFiles.returns(['/some/file.js']);
            moduleMap._init();
          });

          it('should clear and load from map', function() {
            expect(moduleMap.mergeFromCache, 'to have a call satisfying', [
              {destructive: true}
            ]);
          });

          it('should look for known changed files', function() {
            expect(moduleMap.getChangedFiles, 'was called once');
          });

          it('should populate starting from entry files', function() {
            expect(moduleMap._populate, 'to have a call satisfying', [
              new Set([{filename: '/some/file.js'}]),
              {force: true}
            ]);
          });

          it('should persist the module map cache', function() {
            expect(moduleMap.persistModuleMapCache, 'was called once');
          });

          it('should not persist the file entry cache', function() {
            expect(moduleMap.persistFileEntryCache, 'was not called');
          });
        });

        describe('when no files have changed', function() {
          beforeEach(function() {
            moduleMap._init();
          });

          it('should not populate anything', function() {
            expect(moduleMap._populate, 'was not called');
          });
        });

        describe('when provided no options', function() {
          beforeEach(function() {
            moduleMap._init();
          });

          it('should not reset the module map cache', function() {
            expect(moduleMap.resetModuleMapCache, 'was not called');
          });

          it('should not reset the file entry cache', function() {
            expect(moduleMap.resetFileEntryCache, 'was not called');
          });
        });

        describe('when option reset = true', function() {
          beforeEach(function() {
            moduleMap._init({reset: true});
          });
          it('should reset the module map cache', function() {
            expect(moduleMap.resetModuleMapCache, 'was called once');
          });

          it('should reset the file entry cache', function() {
            expect(moduleMap.resetFileEntryCache, 'was called once');
          });
        });
      });

      describe('delete()', function() {
        describe('when deleting a child', function() {
          beforeEach(function() {
            moduleMap.set(
              '/some/file.js',
              mocks.ModuleMapNode.create('/some/file.js', {
                children: ['/some/child.js', '/some/other/child.js']
              })
            );
            moduleMap.set(
              '/some/other/file.js',
              mocks.ModuleMapNode.create('/some/other/file.js')
            );
            moduleMap.set(
              '/some/child.js',
              mocks.ModuleMapNode.create('/some/child.js', {
                parents: ['/some/file.js']
              })
            );
            moduleMap.set(
              '/some/other/child.js',
              mocks.ModuleMapNode.create('/some/other/child.js', {
                parents: ['/some/file.js']
              })
            );
          });

          it('should remove the child from all parents', function() {
            moduleMap.delete('/some/other/child.js');
            expect(
              moduleMap,
              'to exhaustively satisfy',
              new Map([
                [
                  '/some/file.js',
                  mocks.ModuleMapNode.create('/some/file.js', {
                    children: ['/some/child.js']
                  })
                ],
                [
                  '/some/other/file.js',
                  mocks.ModuleMapNode.create('/some/other/file.js', {
                    children: []
                  })
                ],
                [
                  '/some/child.js',
                  mocks.ModuleMapNode.create('/some/child.js', {
                    parents: ['/some/file.js']
                  })
                ]
              ])
            );
          });
        });

        describe('when deletion creates orphaned children', function() {
          beforeEach(function() {
            moduleMap.set(
              '/some/file.js',
              mocks.ModuleMapNode.create('/some/file.js', {
                children: ['/some/child.js', '/some/other/child.js']
              })
            );
            moduleMap.set(
              '/some/other/file.js',
              mocks.ModuleMapNode.create('/some/other/file.js')
            );
            moduleMap.set(
              '/some/child.js',
              mocks.ModuleMapNode.create('/some/child.js', {
                parents: ['/some/file.js']
              })
            );
            moduleMap.set(
              '/some/other/child.js',
              mocks.ModuleMapNode.create('/some/other/child.js', {
                parents: ['/some/file.js']
              })
            );
          });

          it('should delete orphaned children (cascading delete)', function() {
            moduleMap.delete('/some/file.js');
            expect(moduleMap, 'to have size', 1).and(
              'to exhaustively satisfy',
              new Map([
                [
                  '/some/other/file.js',
                  mocks.ModuleMapNode.create('/some/other/file.js')
                ]
              ])
            );
          });
        });

        describe('when deletion does not create orphaned children', function() {
          beforeEach(function() {
            moduleMap.set(
              '/some/file.js',
              mocks.ModuleMapNode.create('/some/file.js', {
                children: ['/some/child.js', '/some/other/child.js']
              })
            );
            moduleMap.set(
              '/some/other/file.js',
              mocks.ModuleMapNode.create('/some/other/file.js', {
                children: ['/some/other/child.js']
              })
            );
            moduleMap.set(
              '/some/child.js',
              mocks.ModuleMapNode.create('/some/child.js', {
                parents: ['/some/file.js']
              })
            );
            moduleMap.set(
              '/some/other/child.js',
              mocks.ModuleMapNode.create('/some/other/child.js', {
                parents: ['/some/other/file.js', '/some/file.js']
              })
            );
          });

          it('should not delete children having other parents', function() {
            moduleMap.delete('/some/file.js');
            expect(moduleMap, 'to have size', 2).and(
              'to exhaustively satisfy',
              new Map([
                [
                  '/some/other/file.js',
                  mocks.ModuleMapNode.create('/some/other/file.js', {
                    children: ['/some/other/child.js']
                  })
                ],
                [
                  '/some/other/child.js',
                  mocks.ModuleMapNode.create('/some/other/child.js', {
                    parents: ['/some/other/file.js']
                  })
                ]
              ])
            );
          });
        });
      });

      describe('save()', function() {
        beforeEach(function() {
          sinon.stub(ModuleMap.prototype, 'persistModuleMapCache');
          sinon.stub(ModuleMap.prototype, 'persistFileEntryCache');
          moduleMap.save();
        });

        it('should persist the module map cache', function() {
          expect(moduleMap.persistModuleMapCache, 'was called once');
        });

        it('should persist the file entry cache', function() {
          expect(moduleMap.persistFileEntryCache, 'was called once');
        });

        it('should return its context', function() {
          expect(moduleMap.save(), 'to be', moduleMap);
        });
      });

      describe('persistFileEntryCache()', function() {
        it('should return its context', function() {
          expect(moduleMap.persistFileEntryCache(), 'to be', moduleMap);
        });

        describe('when provided no options', function() {
          it('should refresh and save the cache with the current list of known files', function() {
            moduleMap.persistFileEntryCache();
            expect(moduleMap._fileEntryCache, 'to satisfy', {
              reconcile: expect
                .it('to have a call satisfying', [true])
                .and('was called once'),
              normalizeEntries: expect
                .it('to have a call satisfying', [[...moduleMap.files]])
                .and('was called once')
            });
          });
        });

        describe('when provided "files" option', function() {
          it('should refresh the cache with the provided list of files', function() {
            const filenames = new Set(['/some/file.js']);
            moduleMap.persistFileEntryCache({filenames});
            expect(
              moduleMap._fileEntryCache.normalizeEntries,
              'to have a call satisfying',
              [[...filenames]]
            ).and('was called once');
          });
        });
      });

      describe('resetFileEntryCache()', function() {
        it('should destroy the file entry cache', function() {
          moduleMap.resetFileEntryCache();
          expect(moduleMap._fileEntryCache.destroy, 'was called once');
        });

        it('should return its context', function() {
          expect(moduleMap.resetFileEntryCache(), 'to be', moduleMap);
        });
      });

      describe('resetModuleMapCache()', function() {
        it('should destroy the file entry cache', function() {
          moduleMap.resetModuleMapCache();
          expect(moduleMap._moduleMapCache.destroy, 'was called once');
        });

        it('should return its context', function() {
          expect(moduleMap.resetModuleMapCache(), 'to be', moduleMap);
        });
      });

      describe('persistModuleMapCache()', function() {
        beforeEach(function() {
          sinon.stub(moduleMap, '_normalizeModuleMapCache');
        });

        it('should normalize the module map cache', function() {
          moduleMap.persistModuleMapCache();
          expect(moduleMap._normalizeModuleMapCache, 'was called once');
        });

        it('should persist the cache to disk', function() {
          moduleMap.persistModuleMapCache();
          expect(moduleMap._moduleMapCache.save, 'to have a call satisfying', [
            true
          ]).and('was called once');
        });

        it('should return its context', function() {
          expect(moduleMap.persistModuleMapCache(), 'to be', moduleMap);
        });
      });

      describe('_normalizeModuleMapCache', function() {
        it('should copy all key/values pairs from the ModuleMap into the cache', function() {
          moduleMap.set(
            '/some/file.js',
            mocks.ModuleMapNode.create('/some/file.js')
          );
          moduleMap.set(
            '/some/other/file.js',
            mocks.ModuleMapNode.create('/some/file.js')
          );
          moduleMap._normalizeModuleMapCache();
          expect(moduleMap._moduleMapCache.setKey, 'to have calls satisfying', [
            ['/some/file.js', mocks.ModuleMapNode.create('/some/file.js')],
            ['/some/other/file.js', mocks.ModuleMapNode.create('/some/file.js')]
          ]).and('was called twice');
        });

        it('should return its context', function() {
          expect(moduleMap._normalizeModuleMapCache(), 'to be', moduleMap);
        });
      });

      describe('findDependencies()', function() {
        it('should delegate to the resolver', function() {
          const retval = moduleMap.findDependencies('some-file.js');
          expect(
            stubs.resolver.resolveDependencies,
            'to have a call satisfying',
            {
              args: [
                path.join(moduleMap.cwd, 'some-file.js'),
                {cwd: moduleMap.cwd, ignore: moduleMap.ignore}
              ],
              returnValue: retval
            }
          ).and('was called once');
        });
      });

      describe('markFileAsChanged()', function() {
        it('should return its context', function() {
          expect(
            moduleMap.markFileAsChanged('some-file.js'),
            'to be',
            moduleMap
          );
        });

        it('should instruct the file entry cache to remove its entry for the provided filename', function() {
          moduleMap.markFileAsChanged('some-file.js');
          expect(
            moduleMap._fileEntryCache.removeEntry,
            'to have a call satisfying',
            ['some-file.js']
          ).and('was called once');
        });
      });

      describe('toJSON()', function() {
        it('should return a stable representation of the module map', function() {
          // the idea here is to assert the result of toJSON() is
          // the same, regardless of the order in which items are set.
          moduleMap.set('foo.js', mocks.ModuleMapNode.create('foo.js'));
          moduleMap.set('bar.js', mocks.ModuleMapNode.create('bar.js'));
          const a = moduleMap.toJSON();
          moduleMap.clear();
          moduleMap.set('bar.js', mocks.ModuleMapNode.create('bar.js'));
          moduleMap.set('foo.js', mocks.ModuleMapNode.create('foo.js'));
          const b = moduleMap.toJSON();
          expect(JSON.stringify(a), 'to be', JSON.stringify(b));
        });
      });

      describe('getChangedFiles()', function() {
        beforeEach(function() {
          sinon.stub(moduleMap, 'getChangedFiles');
          sinon.stub(moduleMap, 'persistFileEntryCache');
        });

        it('should delegate to `getChangedFiles`', function() {
          const result = moduleMap.popChangedFiles();
          expect(moduleMap.getChangedFiles, 'to have a call satisfying', {
            returnValue: result
          }).and('was called once');
        });

        it('should persist the file entry cache', function() {
          moduleMap.popChangedFiles();
          expect(moduleMap.persistFileEntryCache, 'was called once');
        });
      });

      describe('mergeFromCache()', function() {
        beforeEach(function() {
          sinon.spy(moduleMap, 'clear');
        });

        describe('when provided option destructive = true', function() {
          it('should clear the module map', function() {
            moduleMap.mergeFromCache({destructive: true});
            expect(moduleMap.clear, 'was called once');
          });
        });

        describe('when not provided option destructive = true', function() {
          it('should not clear the module map', function() {
            moduleMap.mergeFromCache();
            expect(moduleMap.clear, 'was not called');
          });
        });

        it('should overwrite existing values with the contents of the cache', function() {
          moduleMap.set(
            'foo.js',
            mocks.ModuleMapNode.create('foo.js', {
              children: [],
              parents: [],
              entryFiles: []
            })
          );
          moduleMap.set('bar.js', mocks.ModuleMapNode.create('bar.js'));
          // should use new value for `children` and leave `bar.js` untouched
          moduleMap._moduleMapCache.all.returns({
            'foo.js': {
              filename: 'foo.js',
              children: ['bar.js'],
              entryFiles: [],
              parents: []
            }
          });
          moduleMap.mergeFromCache();
          expect(moduleMap, 'as JSON', 'to satisfy', {
            'foo.js': {filename: 'foo.js', children: ['bar.js']},
            'bar.js': {filename: 'bar.js'}
          });
        });
      });

      describe('addEntryFile()', function() {
        beforeEach(function() {
          stubs.cwd.restore();
          sinon.stub(moduleMap, 'cwd').get(() => '/some/farm/animals');
          sinon.stub(moduleMap, '_populate');
          sinon.spy(moduleMap, 'set');
          sinon.spy(moduleMap.entryFiles, 'add');
        });

        describe('when provided a relative filepath', function() {
          it('should resolve the filepath relative to the `cwd` prop', function() {
            moduleMap.addEntryFile('foo.js');
            expect(moduleMap.entryFiles.add, 'to have a call satisfying', [
              '/some/farm/animals/foo.js'
            ]);
          });
        });

        describe('when provided a file which is already known but not an entry file', function() {
          beforeEach(function() {
            sinon
              .stub(moduleMap, 'has')
              .withArgs('/some/farm/animals/foo.js')
              .returns(true);
            moduleMap.addEntryFile('/some/farm/animals/foo.js');
          });

          it('should add the entry file', function() {
            expect(moduleMap.entryFiles.add, 'was called once');
          });

          it('should not attempt to re-populate from an already known file', function() {
            moduleMap.addEntryFile('/some/farm/animals/foo.js');
            expect(moduleMap._populate, 'was not called');
          });
        });

        describe('when provided a file which is already an entry file', function() {
          beforeEach(function() {
            moduleMap.entryFiles.add('/some/farm/animals/foo.js');
            sinon
              .stub(moduleMap, 'has')
              .withArgs('/some/farm/animals/foo.js')
              .returns(true);
          });

          it('should not attempt to add the entry file', function() {
            moduleMap.addEntryFile('/some/farm/animals/foo.js');
            expect(moduleMap.entryFiles.add, 'was called once');
          });

          it('should not attempt to re-populate from an already known file', function() {
            moduleMap.addEntryFile('/some/farm/animals/foo.js');
            expect(moduleMap._populate, 'was not called');
          });
        });
      });
    });

    describe('interesting computed properties', function() {
      beforeEach(function() {
        sinon.stub(ModuleMap.prototype, '_init');
        moduleMap = new ModuleMap();
      });

      describe('getters', function() {
        describe('entryDirectories', function() {
          beforeEach(function() {
            sinon
              .stub(moduleMap, 'entryFiles')
              .get(() => new Set(['/some/file.js', '/some/other/path.js']));
          });

          it('should return a set of all parent directories of entry files', function() {
            expect(
              moduleMap.entryDirectories,
              'to equal',
              new Set(['/some', '/some/other'])
            );
          });
        });

        describe('directories', function() {
          beforeEach(function() {
            sinon
              .stub(moduleMap, 'files')
              .get(() => new Set(['/some/file.js', '/some/other/path.js']));
          });

          it('should return a set of all parent directories of all files', function() {
            expect(
              moduleMap.directories,
              'to equal',
              new Set(['/some', '/some/other'])
            );
          });
        });

        describe('files', function() {
          beforeEach(function() {
            sinon.stub(moduleMap, 'keys').returns(new Set(['a', 'b', 'c']));
          });

          it('should return a Set of all keys', function() {
            expect(moduleMap.files, 'to equal', new Set(['a', 'b', 'c']));
          });
        });
      });
    });
  });
});