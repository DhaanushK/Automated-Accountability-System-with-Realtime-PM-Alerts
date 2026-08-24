import React, { useState, useEffect } from 'react';
import { Box, Container, Grid, Paper } from '@mui/material';
import MailboxSidebar from './MailboxSidebar';
import EmailList from './EmailList';
import EmailDetail from './EmailDetail';
import SearchBar from './SearchBar';
import ComposeEmail from './ComposeEmail';
import { useMailbox } from '../../hooks/useMailbox';

const Mailbox = () => {
  const [currentFolder, setCurrentFolder] = useState('inbox');
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  
  const {
    emails,
    loading,
    error,
    fetchEmails,
    sendEmail,
    searchEmails
  } = useMailbox();

  useEffect(() => {
    fetchEmails(currentFolder);
  }, [currentFolder]);

  const handleFolderChange = (folder) => {
    setCurrentFolder(folder);
    setSelectedEmail(null);
  };

  const handleEmailSelect = (email) => {
    setSelectedEmail(email);
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query) {
      await searchEmails(query, currentFolder);
    } else {
      fetchEmails(currentFolder);
    }
  };

  const handleCompose = () => {
    setIsComposeOpen(true);
  };

  const handleCloseCompose = () => {
    setIsComposeOpen(false);
  };

  const handleSendEmail = async (emailData) => {
    await sendEmail(emailData);
    setIsComposeOpen(false);
    if (currentFolder === 'sent') {
      fetchEmails('sent');
    }
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        {/* Sidebar */}
        <Grid item xs={12} md={2}>
          <Paper elevation={3}>
            <MailboxSidebar 
              currentFolder={currentFolder}
              onFolderChange={handleFolderChange}
              onCompose={handleCompose}
            />
          </Paper>
        </Grid>

        {/* Main Content */}
        <Grid item xs={12} md={selectedEmail ? 4 : 10}>
          <Paper elevation={3}>
            <Box p={2}>
              <SearchBar 
                onSearch={handleSearch}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Box>
            <EmailList 
              emails={emails}
              loading={loading}
              error={error}
              selectedEmailId={selectedEmail?.id}
              onEmailSelect={handleEmailSelect}
              folder={currentFolder}
            />
          </Paper>
        </Grid>

        {/* Email Detail View */}
        {selectedEmail && (
          <Grid item xs={12} md={6}>
            <Paper elevation={3}>
              <EmailDetail 
                email={selectedEmail}
                onClose={() => setSelectedEmail(null)}
                folder={currentFolder}
              />
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Compose Email Dialog */}
      <ComposeEmail 
        open={isComposeOpen}
        onClose={handleCloseCompose}
        onSend={handleSendEmail}
      />
    </Container>
  );
};

export default Mailbox;