const express = require('express')
const cors = require('cors')
const fs = require('fs')
const glob = require('glob')
const chalk = require('chalk')
const path = require('path')

const mockFileTypes = require('./mock-file-types')

const HttpMethod = {
  GET: 'get',
  POST: 'post',
}

/**
 * @param {object} mapping 
 * @return {string}
 */
function extractHttpMethod(mapping) {
  const supportedMethods = Object.values(HttpMethod)

  const potentialMethod = mapping.split('.').reduce(
    (_, current, index, array) => index === array.length -1 ? current : 'none'
  )

  return supportedMethods.includes(potentialMethod) ? potentialMethod : HttpMethod.GET
}

// String which will be replaced by '/' in api endpoint
// this is being used for directories which have the same name as a file like /test.jpg/medium
// you would name that file /test.jpg---medium.jpg 
const SLASH_ALIAS = '---'

const app = express()
app.use(cors())
app.use(express.json())

/**
 * 
 * @param {string} mockDirectory
 * @param {number} port 
 * @param {string} hostname
 */
function serveMocks (mockDirectory, port, hostname) {
  if (!mockDirectory.startsWith('/')) {
    mockDirectory = '/' + mockDirectory
  }

  if (mockDirectory.endsWith('/')) {
    mockDirectory = mockDirectory.substr(0, mockDirectory.length - 1)
  }

  let currentWorkingDirectory = process.cwd()
  const isPathSeparatorBackslash = path.sep === '\\' // true on windows systems

  if (isPathSeparatorBackslash) {
    // replace backslashes for compatibility with paths returned by glob.sync
    // which is always using slashes as path separator
    currentWorkingDirectory = currentWorkingDirectory.replace(/\\/g, '/')
  }

  const mockFileRoot = currentWorkingDirectory + mockDirectory
  console.log('\nMOCK_DIR=' + mockFileRoot + '\n')

  console.log(chalk.bold('Endpoints:'))
  for (const fileType of mockFileTypes) {
    const mockFilePattern = mockFileRoot + '/**/*' + fileType.extension
    const files = glob.sync(mockFilePattern)

    files.forEach(function(fileName) {
  
      let mapping = fileName.replace(mockFileRoot, '').replace(SLASH_ALIAS, '/').replace(SLASH_ALIAS, '/')
      if (fileType.removeFileExtension === true) {
        mapping = mapping.replace(fileType.extension,'')
      }
  
      const httpMethod = extractHttpMethod(mapping)
      const apiPath = mapping.replace(`.${httpMethod}`, '')
  
      switch(httpMethod) {
      case HttpMethod.GET:
        app.get(apiPath, function (req, res) {
          const data =  fs.readFileSync(fileName, fileType.encoding)
          let responseBody = data
          /*
             * When the request specifies the np query parameter (that stands for No Properties),
             * the response body is the array of embedded resources and does not include the resource properties
             * see https://restheart.org/docs/v3/representation-format/#properties
             */
          if (fileType.extension === '.json' && req.query.np) {
            const jsonData = JSON.parse(data)
            if (jsonData._embedded) {
              responseBody = JSON.stringify(jsonData._embedded)
            }
          }
          console.log(`receiving GET request on ${apiPath}`)
          res.writeHead(200, { 'Content-Type': fileType.contentType })
          res.write(responseBody, fileType.encoding)
          res.end()
        })
        break
      case HttpMethod.POST:
        app.post(apiPath, function (req, res) {
          const endpointParams =  JSON.parse(fs.readFileSync(fileName, 'utf8'))
          const responseOptions = endpointParams.responseOptions ? endpointParams.responseOptions : {}
          const responseDelay = responseOptions.delay_ms ? responseOptions.delay_ms : 2000
          const statusCode = responseOptions.statusCode ? responseOptions.statusCode : 200
          const response = endpointParams.response ? endpointParams.response : { success: true }
          console.log(`receiving POST request on ${apiPath} with body:`, req.body)
          setTimeout(() => {
            res.status(statusCode).send(response)
          }, responseDelay)
        })
        break
      default:
        throw new Error('Unknown Http Method')
      }
  
      console.log(
        '%s %s \n  ⇒ %s (%s)',
        httpMethod.toUpperCase(),
        apiPath,
        fileName.replace(mockFileRoot, '$MOCK_DIR'),
        fileType.contentType
      )
    })
  }
  
  console.log(`\nServing mocks [http://${hostname}:${port}]`)
  app.listen(port, hostname)
}

module.exports = serveMocks
