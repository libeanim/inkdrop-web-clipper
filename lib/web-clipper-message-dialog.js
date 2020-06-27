'use babel'

import * as React from 'react'
import { CompositeDisposable } from 'event-kit'
import { html2markdown } from 'inkdrop'
import Readability from './Readability'
import { models } from 'inkdrop'
// import { actions } from 'inkdrop'
const { Note } = models

export default class WebClipperMessageDialog extends React.Component {
  dialog = { dismissDialog: () => null }
  urlInput = null
  state = {
    urlToClip: '',
    destBookId: null,
    formErrorMessage: null
  }

  componentDidMount() {
    // Events subscribed to in Inkdrop's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable()

    // Register command that toggles this dialog
    this.subscriptions.add(
      inkdrop.commands.add(document.body, {
        'web-clipper:clip-page': () => this.handleClipPageCommand()
      })
    )
  }

  componentWillUnmount() {
    this.subscriptions.dispose()
  }

  renderFormError() {
    if (this.state.formErrorMessage) {
      return (
        <div className="ui negative message">
          <p>{this.state.formErrorMessage}</p>
        </div>
      )
    }
  }

  render() {
    const { MessageDialog, NotebookPicker } = inkdrop.components.classes
    const buttons = [
      {
        label: 'Cancel'
      },
      {
        label: 'Clip',
        primary: true
        // FIXME: allow submit using Enter
      }
    ]

    return (
      <MessageDialog
        ref={d => (this.dialog = d)}
        title="Markdown Web Clipper"
        buttons={buttons}
        onDismiss={this.handleDismissDialog}
      >
        <div className="ui form">
          {this.renderFormError()}
          <div className="field">
            <NotebookPicker
              onChange={this.handleChangeBook}
              selectedBookId={this.state.destBookId}
              placeholder="Select Destination Notebook..."
            />
          </div>
          <div className="field">
            <input
              ref={i => (this.urlInput = i)}
              type="text"
              value={this.state.urlToClip}
              onChange={this.handleChangeUrl}
              placeholder="Type or paste a URL"
            />
          </div>
        </div>
      </MessageDialog>
    )
  }

  handleChangeBook = bookId => {
    // Remember the selected notebook so we can default to it next time.
    inkdrop.config.set('web-clipper.defaultNotebook', bookId);
    this.setState({
      destBookId: bookId
    })
  }

  handleChangeUrl = e => {
    this.setState({
      urlToClip: e.target.value
    })
  }

  handleDismissDialog = (dialog, buttonIndex) => {
    if (buttonIndex === 1) {
      const { destBookId, urlToClip } = this.state
      this.setState({ formErrorMessage: null })

      if (!destBookId) {
        this.setState({
          formErrorMessage: 'Please select the destination notebook.'
        })
        return false
      }

      // Check if the URL is valid
      try {
        new URL(urlToClip)
      } catch (err) {
        console.warn('Web Clipper: invalid URL ' + urlToClip)
        this.setState({ formErrorMessage: 'Please provide a valid URL.' })
        return false
      }

      // Get the page HTML using Fetch
      fetch(urlToClip)
        .then(res => res.text())
        .then(text => {
          // Construct a DOM with the page contents
          const dom = new DOMParser().parseFromString(text, 'text/html')

          // This is required to convert relative links to absolute links
          // as Readability uses dom.baseURI which cannot be modified directly.
          const base = dom.createElement('base')
          base.href = urlToClip
          dom.head.appendChild(base)

          // Strip the page to just the article contents using Readability
          const article = new Readability(dom).parse()

          // Convert the article HTML to Markdown
          let markdown = (0, html2markdown)(article.content)

          // Insert the source and date at the bottom
          markdown = `${markdown}

---

Clipped from [${
            new URL(urlToClip).host
          }](${urlToClip}) on ${new Date().toLocaleDateString()}
`
          const note = new Note({
            title: article.title,
            body: markdown,
            bookId: destBookId
          })

          note.save().then(doc => {
            // Open the newly created note
            inkdrop.commands.dispatch(document.body, 'core:open-note', {
              noteId: doc.id
            })
            this.dialog.dismissDialog()
          })
        })
        .catch(() => {
          console.warn("Web Clipper: couldn't fetch URL " + urlToClip)
          this.setState({ formErrorMessage: "Couldn't clip this URL." })
        })

      return false
    }
  }

  handleClipPageCommand() {
    if (!this.dialog.isShown) {
      this.setState({
        urlToClip: '',
        destBookId: inkdrop.config.get('web-clipper.defaultNotebook'),
        formErrorMessage: null
      })
      this.dialog.showDialog()

      // Automatically focus the URL field so the user can directly paste a URL.
      this.urlInput.focus()
    }
  }
}
